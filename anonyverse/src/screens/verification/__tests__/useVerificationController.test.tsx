import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { usePostHog } from 'posthog-react-native';
import type { AgeLockStore } from '../../../services/ageGate/AgeLockStore';
import type { CalendarDate } from '../../../services/ageGate/ageRules';
import type { AuthService } from '../../../services/auth/AuthService';
import type { VerifyOutcome } from '../../../services/auth/types';
import type { DeviceIdentityService } from '../../../services/deviceIdentity/DeviceIdentityService';
import type { SessionStore } from '../../../services/session/SessionStore';
import { MAX_VERIFY_ATTEMPTS, useVerificationController } from '../useVerificationController';

const mockPostHogClient = jest.mocked(usePostHog)();

jest.mock('react-native-webview', () => {
  const ReactActual = require('react');
  return {
    WebView: ReactActual.forwardRef((props: unknown, ref: unknown) =>
      ReactActual.createElement('WebView', { ...(props as object), ref }),
    ),
  };
});

const NOW = () => new Date(2026, 9, 1);

const AUTH_TOKEN = {
  access_token: 'a',
  refresh_token: 'r',
  access_token_expiry: 3600,
  refresh_token_expiry: 2592000,
};

function makeDeviceIdentityService(deviceId: string | null): DeviceIdentityService {
  return {
    getDeviceId: () => Promise.resolve(deviceId),
    setDeviceId: jest.fn(() => Promise.resolve()),
    clearDeviceId: jest.fn(() => Promise.resolve()),
  };
}

function makeAuthService(
  verifyImpl: (deviceId: string | null, token: string) => Promise<VerifyOutcome>,
): AuthService {
  return {
    getStarted: jest.fn(),
    verify: jest.fn(verifyImpl),
    refresh: jest.fn(),
  };
}

function makeAgeLockStore(lockUntil: CalendarDate | null = null): AgeLockStore {
  return {
    getLockUntil: jest.fn(() => Promise.resolve(lockUntil)),
    setLockUntil: jest.fn(() => Promise.resolve()),
    clearLock: jest.fn(() => Promise.resolve()),
  };
}

function extractNonce(html: string): string {
  const match = html.match(/NONCE = "([^"]+)"/);
  if (!match) {
    throw new Error('nonce not found in generated turnstile html');
  }
  return match[1];
}

async function flushMicrotasks(times = 10) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function postTurnstileMessage(
  handleMessage: (event: never) => void,
  nonce: string,
  message: Record<string, unknown>,
) {
  handleMessage({
    nativeEvent: { data: JSON.stringify({ nonce, ...message }) },
  } as never);
}

function makeSessionStore(): SessionStore {
  return {
    getToken: jest.fn(() => null),
    setToken: jest.fn(),
    isAccessTokenExpired: jest.fn(() => true),
    isRefreshTokenExpired: jest.fn(() => true),
    clear: jest.fn(),
  };
}

function Harness({
  deviceIdentityService,
  authService,
  sessionStore,
  ageLockStore,
  onVerified,
  onReady,
}: {
  deviceIdentityService: DeviceIdentityService;
  authService: AuthService;
  sessionStore: SessionStore;
  ageLockStore: AgeLockStore;
  onVerified: () => void;
  onReady: (result: ReturnType<typeof useVerificationController>) => void;
}) {
  const result = useVerificationController(
    deviceIdentityService,
    authService,
    sessionStore,
    ageLockStore,
    onVerified,
    NOW,
  );
  onReady(result);
  return null;
}

interface RenderedController {
  onVerified: jest.Mock;
  sessionStore: SessionStore;
  ageLockStore: AgeLockStore;
  /** Property access (not destructuring!) re-reads the latest hook result on every access. */
  readonly latest: ReturnType<typeof useVerificationController>;
}

async function render(
  deviceIdentityService: DeviceIdentityService,
  authService: AuthService,
  {
    sessionStore = makeSessionStore(),
    ageLockStore = makeAgeLockStore(),
  }: { sessionStore?: SessionStore; ageLockStore?: AgeLockStore } = {},
): Promise<RenderedController> {
  const onVerified = jest.fn();
  let latest: ReturnType<typeof useVerificationController> | undefined;

  await act(async () => {
    ReactTestRenderer.create(
      <Harness
        deviceIdentityService={deviceIdentityService}
        authService={authService}
        sessionStore={sessionStore}
        ageLockStore={ageLockStore}
        onVerified={onVerified}
        onReady={result => {
          latest = result;
        }}
      />,
    );
    await flushMicrotasks();
  });

  return {
    onVerified,
    sessionStore,
    ageLockStore,
    get latest() {
      return latest!;
    },
  };
}

async function passTurnstile(harness: RenderedController, token: string) {
  const nonce = extractNonce(harness.latest.turnstile.html);
  await act(async () => {
    postTurnstileMessage(harness.latest.turnstile.handleMessage, nonce, {
      type: 'turnstile_success',
      token,
    });
    await flushMicrotasks();
  });
}

async function confirmBirthDate(harness: RenderedController, dob = { year: 1995, month: 5, day: 15 }) {
  await act(async () => {
    harness.latest.handleBirthDateConfirmed(dob);
    await flushMicrotasks();
  });
}

describe('useVerificationController', () => {
  beforeEach(() => {
    jest.useFakeTimers({ legacyFakeTimers: false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('locks the device until the 18th birthday and never verifies for an under-18 date', async () => {
    const authService = makeAuthService(() =>
      Promise.resolve({ status: 'authenticated', deviceId: 'new-device-id', token: AUTH_TOKEN }),
    );
    const harness = await render(makeDeviceIdentityService(null), authService);

    await passTurnstile(harness, 'challenge-token');
    await confirmBirthDate(harness, { year: 2010, month: 3, day: 12 });

    expect(harness.ageLockStore.setLockUntil).toHaveBeenCalledWith({ year: 2028, month: 3, day: 12 });
    expect(harness.latest.phase).toBe('locked');
    expect(authService.verify).not.toHaveBeenCalled();
  });

  it('runs the age check after Turnstile and only then verifies, then auto-continues after the grace period', async () => {
    const authService = makeAuthService(() =>
      Promise.resolve({ status: 'authenticated', deviceId: 'new-device-id', token: AUTH_TOKEN }),
    );
    const deviceIdentityService = makeDeviceIdentityService(null);
    const harness = await render(deviceIdentityService, authService);

    expect(harness.latest.phase).toBe('verifying');

    await passTurnstile(harness, 'challenge-token');

    expect(harness.latest.phase).toBe('age_check');
    expect(harness.latest.needsAgeCheck).toBe(true);
    expect(authService.verify).not.toHaveBeenCalled();

    await confirmBirthDate(harness);

    expect(authService.verify).toHaveBeenCalledWith(null, 'challenge-token');
    expect(harness.latest.needsAgeCheck).toBe(false);
    expect(harness.latest.phase).toBe('verified');
    expect(deviceIdentityService.setDeviceId).toHaveBeenCalledWith('new-device-id');
    expect(harness.sessionStore.setToken).toHaveBeenCalledWith(AUTH_TOKEN);
    expect(mockPostHogClient.identify).toHaveBeenCalledWith('new-device-id');
    expect(harness.onVerified).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(harness.latest.phase).toBe('verified');
    expect(harness.latest.isContinuing).toBe(true);
    expect(harness.onVerified).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(harness.onVerified).toHaveBeenCalledTimes(1);
  });

  it('shows the lock screen without running Turnstile while an under-18 lock is active', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService, {
      ageLockStore: makeAgeLockStore({ year: 2026, month: 10, day: 2 }),
    });

    expect(harness.latest.phase).toBe('locked');
    expect(harness.ageLockStore.clearLock).not.toHaveBeenCalled();

    await passTurnstile(harness, 'challenge-token');

    expect(harness.latest.phase).toBe('locked');
    expect(authService.verify).not.toHaveBeenCalled();
  });

  it('clears a lock once the 18th birthday has arrived', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService, {
      ageLockStore: makeAgeLockStore({ year: 2026, month: 10, day: 1 }),
    });

    expect(harness.ageLockStore.clearLock).toHaveBeenCalledTimes(1);
    expect(harness.latest.phase).toBe('verifying');
  });

  it('verifies with a refreshed Turnstile token when the first one expired during the age check', async () => {
    const authService = makeAuthService(() =>
      Promise.resolve({ status: 'authenticated', deviceId: 'new-device-id', token: AUTH_TOKEN }),
    );
    const harness = await render(makeDeviceIdentityService(null), authService);
    const nonce = extractNonce(harness.latest.turnstile.html);

    await passTurnstile(harness, 'first-token');
    await act(async () => {
      postTurnstileMessage(harness.latest.turnstile.handleMessage, nonce, { type: 'turnstile_expire' });
      await flushMicrotasks();
    });
    await confirmBirthDate(harness);

    expect(authService.verify).not.toHaveBeenCalled();

    await passTurnstile(harness, 'refreshed-token');

    expect(authService.verify).toHaveBeenCalledTimes(1);
    expect(authService.verify).toHaveBeenCalledWith(null, 'refreshed-token');
  });

  it('a message with the wrong nonce is dropped', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService);

    await act(async () => {
      postTurnstileMessage(harness.latest.turnstile.handleMessage, 'forged-nonce', {
        type: 'turnstile_success',
        token: 'forged-token',
      });
      await flushMicrotasks();
    });

    expect(authService.verify).not.toHaveBeenCalled();
    expect(harness.latest.phase).toBe('verifying');
    expect(harness.latest.isContinuing).toBe(false);
    expect(harness.onVerified).not.toHaveBeenCalled();
  });

  it('failed backend verify: phase becomes failed and records one attempt, without auto-resetting Turnstile', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService);

    await passTurnstile(harness, 'challenge-token');
    await confirmBirthDate(harness);

    expect(authService.verify).toHaveBeenCalledTimes(1);
    expect(harness.latest.phase).toBe('failed');
    expect(harness.latest.attempts).toBe(1);
    expect(harness.latest.isContinuing).toBe(false);
    expect(harness.latest.turnstile.token).toBe('challenge-token');
    expect(harness.onVerified).not.toHaveBeenCalled();
    expect(mockPostHogClient.identify).not.toHaveBeenCalled();
  });

  it('handleRetry resets Turnstile and returns to verifying, keeping the attempt count and the age answer', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService);

    await passTurnstile(harness, 'challenge-token');
    await confirmBirthDate(harness);
    expect(harness.latest.phase).toBe('failed');

    act(() => {
      harness.latest.handleRetry();
    });

    expect(harness.latest.phase).toBe('verifying');
    expect(harness.latest.turnstile.token).toBeNull();
    expect(harness.latest.attempts).toBe(1);

    await passTurnstile(harness, 'retry-token');

    expect(harness.latest.needsAgeCheck).toBe(false);
    expect(authService.verify).toHaveBeenLastCalledWith(null, 'retry-token');
  });

  it('failed attempts cap out at MAX_VERIFY_ATTEMPTS', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService);

    for (let i = 0; i < MAX_VERIFY_ATTEMPTS; i += 1) {
      await passTurnstile(harness, `challenge-token-${i}`);
      if (i === 0) {
        await confirmBirthDate(harness);
      }
      expect(harness.latest.phase).toBe('failed');
      expect(harness.latest.attempts).toBe(i + 1);

      if (i < MAX_VERIFY_ATTEMPTS - 1) {
        act(() => {
          harness.latest.handleRetry();
        });
      }
    }

    expect(harness.latest.attempts).toBe(MAX_VERIFY_ATTEMPTS);
  });

  it('a turnstile_error message counts as a failed attempt, without calling authService.verify', async () => {
    const authService = makeAuthService(() =>
      Promise.resolve({ status: 'authenticated', deviceId: 'new-device-id', token: AUTH_TOKEN }),
    );
    const harness = await render(makeDeviceIdentityService(null), authService);
    const nonce = extractNonce(harness.latest.turnstile.html);

    await act(async () => {
      postTurnstileMessage(harness.latest.turnstile.handleMessage, nonce, {
        type: 'turnstile_error',
        error: 'network_error',
      });
      await flushMicrotasks();
    });

    expect(authService.verify).not.toHaveBeenCalled();
    expect(harness.latest.phase).toBe('failed');
    expect(harness.latest.attempts).toBe(1);
    expect(mockPostHogClient.capture).toHaveBeenCalledWith('verification_failed', { reason: 'network_error' });
  });

  it('keeps a locked device locked when a late Turnstile error arrives', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService);
    const nonce = extractNonce(harness.latest.turnstile.html);

    await passTurnstile(harness, 'challenge-token');
    await confirmBirthDate(harness, { year: 2010, month: 3, day: 12 });
    expect(harness.latest.phase).toBe('locked');

    await act(async () => {
      postTurnstileMessage(harness.latest.turnstile.handleMessage, nonce, { type: 'turnstile_error', error: 'late' });
      await flushMicrotasks();
    });
    act(() => {
      harness.latest.handleRetry();
    });

    expect(harness.latest.phase).toBe('locked');
    expect(harness.latest.needsAgeCheck).toBe(false);
    expect(authService.verify).not.toHaveBeenCalled();
  });

  it('exposes when a saved lock lifts', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService, {
      ageLockStore: makeAgeLockStore({ year: 2030, month: 6, day: 1 }),
    });

    expect(harness.latest.lockUntil).toEqual({ year: 2030, month: 6, day: 1 });
  });

  it('exposes the 18th birthday as the unlock date after an under-18 answer', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService);

    expect(harness.latest.lockUntil).toBeNull();
    await passTurnstile(harness, 'challenge-token');
    await confirmBirthDate(harness, { year: 2012, month: 2, day: 29 });

    expect(harness.latest.lockUntil).toEqual({ year: 2030, month: 3, day: 1 });
  });

  it('only counts the first date of birth', async () => {
    const authService = makeAuthService(() =>
      Promise.resolve({ status: 'authenticated', deviceId: 'new-device-id', token: AUTH_TOKEN }),
    );
    const harness = await render(makeDeviceIdentityService(null), authService);

    await passTurnstile(harness, 'challenge-token');
    await confirmBirthDate(harness);
    await confirmBirthDate(harness, { year: 2012, month: 1, day: 1 });

    expect(harness.ageLockStore.setLockUntil).not.toHaveBeenCalled();
    expect(harness.latest.phase).toBe('verified');
  });

  it('asks for the date of birth again after a Turnstile error and retry, if none was given', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService);
    const nonce = extractNonce(harness.latest.turnstile.html);

    await passTurnstile(harness, 'challenge-token');
    expect(harness.latest.needsAgeCheck).toBe(true);

    await act(async () => {
      postTurnstileMessage(harness.latest.turnstile.handleMessage, nonce, { type: 'turnstile_error', error: 'x' });
      await flushMicrotasks();
    });
    expect(harness.latest.phase).toBe('failed');
    expect(harness.latest.needsAgeCheck).toBe(false);

    act(() => {
      harness.latest.handleRetry();
    });
    await passTurnstile(harness, 'retry-token');

    expect(harness.latest.needsAgeCheck).toBe(true);
    expect(authService.verify).not.toHaveBeenCalled();
  });

  it('does not show the popup or run the age check while the lock is still being read', async () => {
    let resolveLock!: (value: CalendarDate | null) => void;
    const ageLockStore = makeAgeLockStore();
    (ageLockStore.getLockUntil as jest.Mock).mockImplementation(
      () => new Promise<CalendarDate | null>(resolve => (resolveLock = resolve)),
    );
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService, { ageLockStore });

    expect(harness.latest.phase).toBe('checking_lock');
    expect(harness.latest.needsAgeCheck).toBe(false);

    await act(async () => {
      resolveLock(null);
      await flushMicrotasks();
    });
    expect(harness.latest.phase).toBe('verifying');
  });

  it('handleContinue only fires onVerified once even if called twice', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService);

    act(() => {
      harness.latest.handleContinue();
      harness.latest.handleContinue();
    });

    expect(harness.latest.isContinuing).toBe(true);
    expect(harness.onVerified).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(harness.onVerified).toHaveBeenCalledTimes(1);
  });
});
