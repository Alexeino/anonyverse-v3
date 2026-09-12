import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '../../config/env';
import type { AuthService } from '../../services/auth/AuthService';
import type { DeviceIdentityService } from '../../services/deviceIdentity/DeviceIdentityService';
import { useTurnstile, type UseTurnstileResult } from '../../services/turnstile/useTurnstile';

export type VerificationPhase = 'verifying' | 'verified';

/** How long the "Verified" success state is shown before auto-continuing, if the user hasn't already tapped Continue. */
const AUTO_CONTINUE_DELAY_MS = 1500;

/** How long the Continue button shows its "moving to the next stage" transition before onVerified actually fires. */
const CONTINUE_TRANSITION_MS = 500;

export interface UseVerificationControllerResult {
  phase: VerificationPhase;
  /** True only during the transient hand-off to onVerified (tap or auto-continue) — not a business state. */
  isContinuing: boolean;
  turnstile: UseTurnstileResult;
  /** Tap handler for the "Continue" CTA on the verified state. */
  handleContinue: () => void;
}

/**
 * Owns the Verification screen's state machine: loads the local device
 * ID, runs the Turnstile challenge (see useTurnstile), submits the
 * resulting token to POST /api/v1/captcha/verify, and — once the backend
 * confirms AUTHENTICATED — shows the verified state and hands off via
 * `onVerified`, either because the user tapped Continue or after a 1.5s
 * grace period, whichever happens first (matching the previous app's
 * behavior, ported here per the task description).
 *
 * The Mood Check screen this hands off to doesn't exist yet, so
 * `onVerified` is just a callback — see VerificationRoute in
 * RootNavigator.tsx for where that becomes a console.log for now.
 */
export function useVerificationController(
  deviceIdentityService: DeviceIdentityService,
  authService: AuthService,
  onVerified: () => void,
): UseVerificationControllerResult {
  const [phase, setPhase] = useState<VerificationPhase>('verifying');
  const [isContinuing, setIsContinuing] = useState(false);
  const verifyingRef = useRef(false);
  const continuedRef = useRef(false);

  const turnstile = useTurnstile(env.turnstileSiteKey, 'light');
  const { token, reset } = turnstile;

  const fireOnVerifiedOnce = useCallback(() => {
    if (continuedRef.current) {
      return;
    }
    continuedRef.current = true;
    setIsContinuing(true);
  }, []);

  useEffect(() => {
    if (!token || verifyingRef.current) {
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
        if (__DEV__) {
          console.log(`[Verification] Device "${outcome.deviceId}" verified successfully.`);
        }
        setPhase('verified');
        return;
      }

      console.error(
        '[Verification] Backend rejected the Turnstile token — resetting to retry.',
        outcome.error,
      );
      reset();
    })();

    return () => {
      cancelled = true;
    };
  }, [token, authService, deviceIdentityService, reset]);

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

  return { phase, isContinuing, turnstile, handleContinue: fireOnVerifiedOnce };
}
