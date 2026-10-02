import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '../../config/env';
import type { AgeLockStore } from '../../services/ageGate/AgeLockStore';
import {
  addYears,
  eighteenthBirthday,
  isAdult,
  isLockActive,
  toCalendarDate,
  type CalendarDate,
} from '../../services/ageGate/ageRules';
import type { AgeSignalService, OsAgeAnswer } from '../../services/ageSignals/AgeSignalService';
import type { AuthService } from '../../services/auth/AuthService';
import type { DeviceIdentityService } from '../../services/deviceIdentity/DeviceIdentityService';
import type { SessionStore } from '../../services/session/SessionStore';
import { useTurnstile, type UseTurnstileResult } from '../../services/turnstile/useTurnstile';
import { useAnalyticsCapture, useCaptureEvent, useIdentifyDevice } from '../../hooks/usePosthogHooks';

export type VerificationPhase = 'checking_lock' | 'locked' | 'verifying' | 'age_check' | 'verified' | 'failed';

/** The phone's own age check, run once Turnstile passes and before the date-of-birth popup. */
type OsAgeStep = 'idle' | 'explainer' | 'checking' | 'done';

const defaultNow = () => new Date();

const OS_MINOR_LOCK_YEARS = 1;

/** How long the "Verified" success state is shown before auto-continuing, if the user hasn't already tapped Continue. */
const AUTO_CONTINUE_DELAY_MS = 1500;

/** How long the Continue button shows its "moving to the next stage" transition before onVerified actually fires. */
const CONTINUE_TRANSITION_MS = 500;

/** How many failed attempts (bot-rejected, network error, or any other failure) are allowed before the screen stops offering a retry. */
export const MAX_VERIFY_ATTEMPTS = 2;

export interface UseVerificationControllerResult {
  phase: VerificationPhase;
  /** True only during the transient hand-off to onVerified (tap or auto-continue) — not a business state. */
  isContinuing: boolean;
  /** Number of failed attempts so far — meaningful while phase is 'failed'. */
  attempts: number;
  turnstile: UseTurnstileResult;
  /** True while the date-of-birth popup should be shown: Turnstile passed, the phone had no answer. */
  needsAgeCheck: boolean;
  /** True while the explainer before Apple's age-sharing sheet should be shown. */
  needsAgeSharingExplainer: boolean;
  handleAgeSharingContinue: () => void;
  /** When the under-18 lock lifts, while phase is 'locked'. */
  lockUntil: CalendarDate | null;
  handleBirthDateConfirmed: (dob: CalendarDate) => void;
  /** Tap handler for the "Continue" CTA on the verified state. */
  handleContinue: () => void;
  /** Tap handler for the "Try again" CTA on the failed (not yet exhausted) state. */
  handleRetry: () => void;
}

/**
 * Owns the Verification screen's state machine: shows the lock screen if
 * an under-18 date of birth locked this device, otherwise runs the
 * Turnstile challenge (see useTurnstile), then asks the phone for the
 * user's age range (Apple / Google Play), falling back to a date-of-birth
 * popup when it has no answer (an under-18 date locks this device locally;
 * nothing about age is sent),
 * submits the Turnstile token to POST /api/v1/captcha/verify, and — once the backend
 * confirms AUTHENTICATED — shows the verified state and hands off via
 * `onVerified`, either because the user tapped Continue or after a 1.5s
 * grace period, whichever happens first.
 *
 * A rejected token, a failed /verify request, and a Turnstile-side error
 * are all treated the same way — a failed attempt — since none of them
 * are distinguishable in a way that changes what the user should do next.
 * After MAX_VERIFY_ATTEMPTS failures the screen stops offering a retry
 * (see VerificationScreen for the exhausted-state UI).
 */
export function useVerificationController(
  deviceIdentityService: DeviceIdentityService,
  authService: AuthService,
  sessionStore: SessionStore,
  ageLockStore: AgeLockStore,
  ageSignalService: AgeSignalService,
  onVerified: () => void,
  now: () => Date = defaultNow,
): UseVerificationControllerResult {
  const [phase, setPhase] = useState<VerificationPhase>('checking_lock');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [lockUntil, setLockUntil] = useState<CalendarDate | null>(null);
  const ageAnsweredRef = useRef(false);
  const [osAgeStep, setOsAgeStep] = useState<OsAgeStep>('idle');
  const osAgeStartedRef = useRef(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const verifyingRef = useRef(false);
  const continuedRef = useRef(false);

  useCaptureEvent("verification_started")
  const captureAnalytics = useAnalyticsCapture();
  const identifyDevice = useIdentifyDevice();

  const turnstile = useTurnstile(env.turnstileSiteKey, 'light');
  const { token, error: turnstileError, reset } = turnstile;

  const fireOnVerifiedOnce = useCallback(() => {
    if (continuedRef.current) {
      return;
    }
    continuedRef.current = true;
    setIsContinuing(true);
  }, []);

  const recordFailure = useCallback((error: any) => {
    setAttempts(current => current + 1);
    // A late Turnstile message must not turn a locked device back into a retryable one.
    setPhase(current => (current === 'locked' ? current : 'failed'));
    captureAnalytics("verification_failed", {
      reason: error instanceof Error ? error.message : String(error ?? 'unknown')
    })
  }, [captureAnalytics]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedLock = await ageLockStore.getLockUntil();
      if (cancelled) {
        return;
      }
      if (savedLock && isLockActive(savedLock, toCalendarDate(now()))) {
        setLockUntil(savedLock);
        setPhase('locked');
        return;
      }
      if (savedLock) {
        await ageLockStore.clearLock();
      }
      if (!cancelled) {
        setPhase('verifying');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ageLockStore, now]);

  useEffect(() => {
    if (!token || verifyingRef.current) {
      return;
    }
    // The token is held until the age popup is answered; an expired one is
    // refreshed by the widget and picked up here.
    if (!ageConfirmed) {
      setPhase(current => (current === 'verifying' ? 'age_check' : current));
      return;
    }

    verifyingRef.current = true;
    let cancelled = false;

    (async () => {
      // Read fresh rather than caching on mount — the Turnstile
      // challenge can resolve at any time, and this keeps the request
      // correct even if local storage changes while it's in flight.
      const deviceId = await deviceIdentityService.getDeviceId();
      const outcome = await authService.verify(deviceId, token);
      verifyingRef.current = false;

      if (cancelled) {
        return;
      }

      if (outcome.status === 'authenticated') {
        if (outcome.deviceId !== deviceId) {
          await deviceIdentityService.setDeviceId(outcome.deviceId);
        }
        if (cancelled) {
          return;
        }
        sessionStore.setToken(outcome.token);
        identifyDevice(outcome.deviceId);
        if (__DEV__) {
          console.log(`[Verification] Device "${outcome.deviceId}" verified successfully.`);
        }
        setPhase('verified');
        captureAnalytics("verification_succeeded")
        return;
      }

      console.error('[Verification] Backend rejected the Turnstile token.', outcome.error);
      recordFailure(outcome?.error);
    })();

    return () => {
      cancelled = true;
    };
  }, [token, ageConfirmed, authService, deviceIdentityService, sessionStore, recordFailure, captureAnalytics, identifyDevice]);

  useEffect(() => {
    if (!turnstileError) {
      return;
    }
    if (__DEV__) {
      console.error('[Verification] Turnstile widget reported an error.', turnstileError);
    }
    recordFailure(turnstileError);
  }, [turnstileError, recordFailure]);

  useEffect(() => {
    if (phase !== 'verified') {
      return;
    }

    const timer = setTimeout(fireOnVerifiedOnce, AUTO_CONTINUE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, fireOnVerifiedOnce]);

  useEffect(() => {
    if (!isContinuing) {
      return;
    }

    const timer = setTimeout(onVerified, CONTINUE_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [isContinuing, onVerified]);

  const applyOsAgeAnswer = useCallback((answer: OsAgeAnswer) => {
    if (answer !== 'unknown' && !ageAnsweredRef.current) {
      ageAnsweredRef.current = true;
      if (answer === 'adult') {
        setAgeConfirmed(true);
      } else {
        // The phone gives no birthday, so lock for a year; otherwise declining the
        // phone's check on the next launch would open the date-of-birth popup.
        const until = addYears(toCalendarDate(now()), OS_MINOR_LOCK_YEARS);
        ageLockStore.setLockUntil(until).then(() => {
          setLockUntil(until);
          setPhase('locked');
        });
        return;
      }
    }
    setOsAgeStep('done');
  }, [ageLockStore, now]);

  const runOsAgeCheck = useCallback(() => {
    setOsAgeStep('checking');
    ageSignalService.check().then(applyOsAgeAnswer, () => applyOsAgeAnswer('unknown'));
  }, [ageSignalService, applyOsAgeAnswer]);

  useEffect(() => {
    if (phase !== 'age_check' || osAgeStartedRef.current) {
      return;
    }
    osAgeStartedRef.current = true;
    setOsAgeStep('checking');
    ageSignalService.showsSystemSheet().then(
      showsSheet => (showsSheet ? setOsAgeStep('explainer') : runOsAgeCheck()),
      () => runOsAgeCheck(),
    );
  }, [phase, ageSignalService, runOsAgeCheck]);

  const handleAgeSharingContinue = useCallback(() => {
    if (osAgeStep === 'explainer') {
      runOsAgeCheck();
    }
  }, [osAgeStep, runOsAgeCheck]);

  const handleBirthDateConfirmed = useCallback(
    (dob: CalendarDate) => {
      if (ageAnsweredRef.current) {
        return;
      }
      ageAnsweredRef.current = true;
      if (isAdult(dob, toCalendarDate(now()))) {
        setAgeConfirmed(true);
        return;
      }
      (async () => {
        const until = eighteenthBirthday(dob);
        await ageLockStore.setLockUntil(until);
        setLockUntil(until);
        setPhase('locked');
      })();
    },
    [ageLockStore, now],
  );

  const handleRetry = useCallback(() => {
    if (attempts >= MAX_VERIFY_ATTEMPTS || phase === 'locked') {
      return;
    }
    verifyingRef.current = false;
    reset();
    setPhase('verifying');
  }, [attempts, phase, reset]);

  return {
    phase,
    isContinuing,
    attempts,
    turnstile,
    needsAgeCheck: phase === 'age_check' && !ageConfirmed && osAgeStep === 'done',
    needsAgeSharingExplainer: phase === 'age_check' && osAgeStep === 'explainer',
    handleAgeSharingContinue,
    lockUntil,
    handleBirthDateConfirmed,
    handleContinue: fireOnVerifiedOnce,
    handleRetry,
  };
}
