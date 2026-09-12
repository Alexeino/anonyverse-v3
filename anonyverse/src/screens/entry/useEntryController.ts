import { useCallback, useEffect, useState } from 'react';
import type { AuthService } from '../../services/auth/AuthService';
import type { DeviceIdentityService } from '../../services/deviceIdentity/DeviceIdentityService';

/**
 * Where the Entry screen hands off to once its job is done. These are not
 * yet real React Navigation routes (Verification and Chat List don't
 * exist as screens yet) — see RootNavigator's onContinue handler.
 */
export type EntryDestination = 'verification' | 'chat-list';

export type EntryPhase = 'checking' | 'ready';

/** How long the "Taking you in…" transition shows before onContinue('chat-list') actually fires, matching useVerificationController's CONTINUE_TRANSITION_MS. */
const CONTINUE_TRANSITION_MS = 500;

export interface UseEntryControllerResult {
  phase: EntryPhase;
  /** True only while transitioning an already-authenticated device to Chat List. */
  isContinuing: boolean;
  handleStart: () => void;
}

/**
 * Owns the Entry screen's first-time vs returning-user decision, kept
 * separate from EntryScreen's rendering.
 *
 * There are only two business states — NEW USER and EXISTING USER — never
 * persisted, always derived: no local device ID means NEW USER immediately,
 * with no backend round trip. A local device ID is checked against
 * POST /api/v1/captcha/get-started; the backend confirming it is EXISTING
 * USER, anything else (explicitly unverified, or the request failing)
 * means NEW USER, since the only way to regain backend access either way
 * is completing Verification.
 */
export function useEntryController(
  deviceIdentityService: DeviceIdentityService,
  authService: AuthService,
  onContinue: (destination: EntryDestination) => void,
): UseEntryControllerResult {
  const [phase, setPhase] = useState<EntryPhase>('checking');
  const [isContinuing, setIsContinuing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const deviceId = await deviceIdentityService.getDeviceId();

      if (cancelled) {
        return;
      }

      if (deviceId === null) {
        // No local device identity — definitely a new user. Show the
        // first-time "Let's start" CTA immediately; there is nothing for
        // get-started to reconcile, so it is not called at all.
        setPhase('ready');
        return;
      }

      const outcome = await authService.getStarted(deviceId);

      if (cancelled) {
        return;
      }

      switch (outcome.status) {
        case 'authenticated': {
          if (outcome.deviceId !== deviceId) {
            await deviceIdentityService.setDeviceId(outcome.deviceId);
          }
          if (__DEV__) {
            console.log(
              `[Entry] Device "${outcome.deviceId}" exists and is verified — no verification required.`,
            );
          }
          setPhase('ready');
          setIsContinuing(true);
          return;
        }
        case 'verification_required': {
          console.log('[Entry] No verified device — showing the first-time flow.');
          setPhase('ready');
          return;
        }
        case 'failed': {
          // A failed request means "we don't know yet", not "new user" —
          // but since the only way to regain backend access either way is
          // completing Verification, there is nothing a retry here would
          // unlock that Verification doesn't already, so it is treated
          // the same as an explicit "unverified" response.
          console.error(
            '[Entry] get-started request failed — falling back to the first-time flow.',
            outcome.error,
          );
          setPhase('ready');
          return;
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [deviceIdentityService, authService]);

  useEffect(() => {
    if (!isContinuing) {
      return;
    }

    const timer = setTimeout(() => onContinue('chat-list'), CONTINUE_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [isContinuing, onContinue]);

  const handleStart = useCallback(() => {
    onContinue('verification');
  }, [onContinue]);

  return { phase, isContinuing, handleStart };
}
