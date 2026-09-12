import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { AuthService } from '../../../services/auth/AuthService';
import type { VerifyOutcome } from '../../../services/auth/types';
import type { DeviceIdentityService } from '../../../services/deviceIdentity/DeviceIdentityService';
import { useVerificationController } from '../useVerificationController';

jest.mock('react-native-webview', () => {
  const ReactActual = require('react');
  return {
    WebView: ReactActual.forwardRef((props: unknown, ref: unknown) =>
      ReactActual.createElement('WebView', { ...(props as object), ref }),
    ),
  };
});

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

function Harness({
  deviceIdentityService,
  authService,
  onVerified,
  onReady,
}: {
  deviceIdentityService: DeviceIdentityService;
  authService: AuthService;
  onVerified: () => void;
  onReady: (result: ReturnType<typeof useVerificationController>) => void;
}) {
  const result = useVerificationController(deviceIdentityService, authService, onVerified);
  onReady(result);
  return null;
}

interface RenderedController {
  onVerified: jest.Mock;
  /** Property access (not destructuring!) re-reads the latest hook result on every access. */
  readonly latest: ReturnType<typeof useVerificationController>;
}

async function render(
  deviceIdentityService: DeviceIdentityService,
  authService: AuthService,
): Promise<RenderedController> {
  const onVerified = jest.fn();
  let latest: ReturnType<typeof useVerificationController> | undefined;

  await act(async () => {
    ReactTestRenderer.create(
      <Harness
        deviceIdentityService={deviceIdentityService}
        authService={authService}
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
    get latest() {
      return latest!;
    },
  };
}

describe('useVerificationController', () => {
  beforeEach(() => {
    jest.useFakeTimers({ legacyFakeTimers: false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('successful token + successful backend verify: flips to verified and auto-continues after the grace period', async () => {
    const authService = makeAuthService(() =>
      Promise.resolve({
        status: 'authenticated',
        deviceId: 'new-device-id',
        token: {
          access_token: 'a',
          refresh_token: 'r',
          access_token_expiry: 3600,
          refresh_token_expiry: 2592000,
        },
      }),
    );
    const deviceIdentityService = makeDeviceIdentityService(null);
    const harness = await render(deviceIdentityService, authService);

    expect(harness.latest.phase).toBe('verifying');
    const nonce = extractNonce(harness.latest.turnstile.html);

    await act(async () => {
      postTurnstileMessage(harness.latest.turnstile.handleMessage, nonce, {
        type: 'turnstile_success',
        token: 'challenge-token',
      });
      await flushMicrotasks();
    });

    expect(authService.verify).toHaveBeenCalledWith(null, 'challenge-token');
    expect(harness.latest.phase).toBe('verified');
    expect(deviceIdentityService.setDeviceId).toHaveBeenCalledWith('new-device-id');
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

  it('failed backend verify: resets the token so the widget can retry, and does not continue', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'failed' }));
    const harness = await render(makeDeviceIdentityService(null), authService);

    const nonce = extractNonce(harness.latest.turnstile.html);

    await act(async () => {
      postTurnstileMessage(harness.latest.turnstile.handleMessage, nonce, {
        type: 'turnstile_success',
        token: 'challenge-token',
      });
      await flushMicrotasks();
    });

    expect(authService.verify).toHaveBeenCalledTimes(1);
    expect(harness.latest.phase).toBe('verifying');
    expect(harness.latest.isContinuing).toBe(false);
    expect(harness.latest.turnstile.token).toBeNull();
    expect(harness.onVerified).not.toHaveBeenCalled();
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
