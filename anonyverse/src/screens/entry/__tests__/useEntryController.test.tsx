import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { AuthService } from '../../../services/auth/AuthService';
import type { GetStartedOutcome } from '../../../services/auth/types';
import type { DeviceIdentityService } from '../../../services/deviceIdentity/DeviceIdentityService';
import type { SessionStore } from '../../../services/session/SessionStore';
import { useEntryController, type EntryDestination } from '../useEntryController';

function makeDeviceIdentityService(deviceId: string | null): DeviceIdentityService {
  return {
    getDeviceId: () => Promise.resolve(deviceId),
    setDeviceId: jest.fn(() => Promise.resolve()),
    clearDeviceId: jest.fn(() => Promise.resolve()),
  };
}

function makeAuthService(outcome: GetStartedOutcome): AuthService {
  return {
    getStarted: jest.fn(() => Promise.resolve(outcome)),
    verify: jest.fn(),
  };
}

function makeSessionStore(): SessionStore {
  return {
    getToken: jest.fn(() => null),
    setToken: jest.fn(),
    clear: jest.fn(),
  };
}

function Harness({
  deviceIdentityService,
  authService,
  sessionStore,
  onContinue,
  onReady,
}: {
  deviceIdentityService: DeviceIdentityService;
  authService: AuthService;
  sessionStore: SessionStore;
  onContinue: (destination: EntryDestination) => void;
  onReady: (result: ReturnType<typeof useEntryController>) => void;
}) {
  const result = useEntryController(deviceIdentityService, authService, sessionStore, onContinue);
  onReady(result);
  return null;
}

async function render(
  deviceIdentityService: DeviceIdentityService,
  authService: AuthService,
  sessionStore: SessionStore = makeSessionStore(),
) {
  const onContinue = jest.fn();
  let latest: ReturnType<typeof useEntryController> | undefined;

  await act(async () => {
    ReactTestRenderer.create(
      <Harness
        deviceIdentityService={deviceIdentityService}
        authService={authService}
        sessionStore={sessionStore}
        onContinue={onContinue}
        onReady={result => {
          latest = result;
        }}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  return { onContinue, sessionStore, get latest() { return latest; } };
}

describe('useEntryController', () => {
  beforeEach(() => {
    jest.useFakeTimers({ legacyFakeTimers: false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('authenticated (device verified): shows a "Taking you in…" transition, then continues to chat-list', async () => {
    const token = {
      access_token: 'a',
      refresh_token: 'r',
      access_token_expiry: 3600,
      refresh_token_expiry: 2592000,
    };
    const { onContinue, sessionStore, latest } = await render(
      makeDeviceIdentityService('existing-device-id'),
      makeAuthService({
        status: 'authenticated',
        deviceId: 'existing-device-id',
        token,
      }),
    );

    expect(latest?.phase).toBe('ready');
    expect(latest?.isContinuing).toBe(true);
    expect(onContinue).not.toHaveBeenCalled();
    expect(sessionStore.setToken).toHaveBeenCalledWith(token);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onContinue).toHaveBeenCalledWith('chat-list');
  });

  it('device id exists, backend says verification required: shows "Let\'s start" and only continues after it is tapped', async () => {
    const authService = makeAuthService({ status: 'verification_required' });
    const { onContinue, latest } = await render(
      makeDeviceIdentityService('existing-device-id'),
      authService,
    );

    expect(authService.getStarted).toHaveBeenCalledWith('existing-device-id');
    expect(latest?.phase).toBe('ready');
    expect(latest?.isContinuing).toBe(false);
    expect(onContinue).not.toHaveBeenCalled();

    act(() => {
      latest?.handleStart();
    });

    expect(onContinue).toHaveBeenCalledWith('verification');
  });

  it('device id exists, get-started request fails: falls back to the first-time flow, same as an unverified device', async () => {
    const { onContinue, latest } = await render(
      makeDeviceIdentityService('existing-device-id'),
      makeAuthService({ status: 'failed', error: new Error('network down') }),
    );

    expect(latest?.phase).toBe('ready');
    expect(latest?.isContinuing).toBe(false);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('no local device id: shows "Let\'s start" immediately and never calls get-started', async () => {
    const authService = makeAuthService({ status: 'verification_required' });

    const { onContinue, latest } = await render(makeDeviceIdentityService(null), authService);

    expect(latest?.phase).toBe('ready');
    expect(latest?.isContinuing).toBe(false);
    expect(authService.getStarted).not.toHaveBeenCalled();

    act(() => {
      latest?.handleStart();
    });

    expect(onContinue).toHaveBeenCalledWith('verification');
  });
});
