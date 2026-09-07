import { useCallback, useEffect, useState } from 'react';
import type { DeviceIdentityService } from '../../services/deviceIdentity/DeviceIdentityService';

/**
 * Where the Entry screen hands off to once its job is done. These are not
 * yet real React Navigation routes (Verification and Chat List don't
 * exist as screens yet) — see RootNavigator's onContinue handler.
 */
export type EntryDestination = 'verification' | 'chat-list';

export type EntryPhase = 'bootstrapping' | 'first_time_ready';

export interface UseEntryControllerResult {
  phase: EntryPhase;
  handleStart: () => void;
}

/**
 * Owns the Entry screen's first-time vs returning-user decision, kept
 * separate from EntryScreen's rendering.
 *
 * Per docs/flow.md §2: a first-time user (no secure device ID) sees the
 * "Let's start" CTA and must tap it to continue to Verification. A
 * returning user (secure device ID already exists) is taken straight to
 * Chat List once the bootstrap check completes — no tap required.
 */
export function useEntryController(
  deviceIdentityService: DeviceIdentityService,
  onContinue: (destination: EntryDestination) => void,
): UseEntryControllerResult {
  const [phase, setPhase] = useState<EntryPhase>('bootstrapping');

  useEffect(() => {
    let cancelled = false;

    deviceIdentityService.getDeviceId().then(deviceId => {
      if (cancelled) {
        return;
      }

      if (deviceId) {
        onContinue('chat-list');
      } else {
        setPhase('first_time_ready');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [deviceIdentityService, onContinue]);

  const handleStart = useCallback(() => {
    onContinue('verification');
  }, [onContinue]);

  return { phase, handleStart };
}
