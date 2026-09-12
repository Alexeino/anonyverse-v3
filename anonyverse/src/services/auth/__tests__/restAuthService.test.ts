import { restAuthService } from '../restAuthService';

function mockFetchOnce(body: unknown, status = 200) {
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  ) as unknown as typeof fetch;
}

describe('restAuthService.getStarted', () => {
  it('returns authenticated for a known, verified device even when the backend omits `device`', async () => {
    // Real response for an already-known device: verified + token, but no
    // `device` — it only confirms the device_id sent in the request.
    mockFetchOnce({
      device_exists: true,
      verified: true,
      token: {
        access_token: 'a',
        refresh_token: 'r',
        access_token_expiry: 1800,
        refresh_token_expiry: 14400,
      },
    });

    const outcome = await restAuthService.getStarted('existing-device-id');

    expect(outcome).toEqual({
      status: 'authenticated',
      deviceId: 'existing-device-id',
      token: {
        access_token: 'a',
        refresh_token: 'r',
        access_token_expiry: 1800,
        refresh_token_expiry: 14400,
      },
    });
  });

  it('still prefers a device_id the backend does return (e.g. a newly assigned one)', async () => {
    mockFetchOnce({
      device_exists: true,
      verified: true,
      token: {
        access_token: 'a',
        refresh_token: 'r',
        access_token_expiry: 1800,
        refresh_token_expiry: 14400,
      },
      device: { device_id: 'server-assigned-id' },
    });

    const outcome = await restAuthService.getStarted('existing-device-id');

    expect(outcome).toMatchObject({ status: 'authenticated', deviceId: 'server-assigned-id' });
  });

  it('falls back to verification_required when verified but no device id is available at all', async () => {
    mockFetchOnce({
      device_exists: false,
      verified: true,
      token: {
        access_token: 'a',
        refresh_token: 'r',
        access_token_expiry: 1800,
        refresh_token_expiry: 14400,
      },
    });

    const outcome = await restAuthService.getStarted(null);

    expect(outcome).toEqual({ status: 'verification_required' });
  });

  it('returns verification_required when not verified', async () => {
    mockFetchOnce({ device_exists: false, verified: false, token: null });

    const outcome = await restAuthService.getStarted(null);

    expect(outcome).toEqual({ status: 'verification_required' });
  });
});
