import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { DeviceIdentityService } from '../../../services/deviceIdentity/DeviceIdentityService';
import { useEntryController, type EntryDestination } from '../useEntryController';

function makeService(deviceId: string | null): DeviceIdentityService {
  return {
    getDeviceId: () => Promise.resolve(deviceId),
    setDeviceId: jest.fn(),
    clearDeviceId: jest.fn(),
  };
}

function Harness({
  service,
  onContinue,
  onReady,
}: {
  service: DeviceIdentityService;
  onContinue: (destination: EntryDestination) => void;
  onReady: (result: ReturnType<typeof useEntryController>) => void;
}) {
  const result = useEntryController(service, onContinue);
  onReady(result);
  return null;
}

describe('useEntryController', () => {
  it('first-time user (no device id): stays put and only continues after "Let\'s start"', async () => {
    const onContinue = jest.fn();
    let latest: ReturnType<typeof useEntryController> | undefined;

    await act(async () => {
      ReactTestRenderer.create(
        <Harness
          service={makeService(null)}
          onContinue={onContinue}
          onReady={result => {
            latest = result;
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(latest?.phase).toBe('first_time_ready');
    expect(onContinue).not.toHaveBeenCalled();

    act(() => {
      latest?.handleStart();
    });

    expect(onContinue).toHaveBeenCalledWith('verification');
  });

  it('returning user (device id exists): continues to chat-list without any tap', async () => {
    const onContinue = jest.fn();
    let latest: ReturnType<typeof useEntryController> | undefined;

    await act(async () => {
      ReactTestRenderer.create(
        <Harness
          service={makeService('existing-device-id')}
          onContinue={onContinue}
          onReady={result => {
            latest = result;
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(onContinue).toHaveBeenCalledWith('chat-list');
    expect(latest?.phase).toBe('bootstrapping');
  });
});
