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

describe('restAuthService.refresh', () => {
  const TOKEN = {
    access_token: 'a2',
    refresh_token: 'r2',
    access_token_expiry: 1800,
    refresh_token_expiry: 14400,
  };

  it('returns the new token pair', async () => {
    mockFetchOnce(TOKEN);

    const outcome = await restAuthService.refresh('r1');

    expect(outcome).toEqual({ status: 'refreshed', token: TOKEN });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/jwt\/refresh$/),
      expect.objectContaining({ body: JSON.stringify({ refresh_token: 'r1' }) }),
    );
  });

  it('returns reauth_required on 401 (revoked or expired refresh token)', async () => {
    mockFetchOnce({ detail: 'Refresh token has been revoked' }, 401);

    expect(await restAuthService.refresh('r1')).toEqual({ status: 'reauth_required' });
  });

  it.each([429, 500, 503])('returns failed (retryable) on %i', async status => {
    mockFetchOnce({ detail: 'x' }, status);

    expect(await restAuthService.refresh('r1')).toMatchObject({ status: 'failed' });
  });

  it.each([
    ['a missing access_token', { ...TOKEN, access_token: undefined }],
    ['an empty refresh_token', { ...TOKEN, refresh_token: '' }],
    ['a non-numeric expiry', { ...TOKEN, access_token_expiry: '1800' }],
    ['a zero expiry', { ...TOKEN, refresh_token_expiry: 0 }],
    ['a non-object body', null],
  ])('returns failed for a 200 with %s', async (_label, body) => {
    mockFetchOnce(body);

    expect(await restAuthService.refresh('r1')).toMatchObject({ status: 'failed' });
  });
});
