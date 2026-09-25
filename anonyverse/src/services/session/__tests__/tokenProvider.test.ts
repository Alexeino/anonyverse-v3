import type { AuthService } from '../../auth/AuthService';
import type { AuthToken, RefreshOutcome } from '../../auth/types';
import type { SessionStore } from '../SessionStore';
import { createTokenProvider } from '../tokenProvider';

const OLD_TOKEN: AuthToken = {
  access_token: 'a1',
  refresh_token: 'r1',
  access_token_expiry: 1800,
  refresh_token_expiry: 14400,
};
const NEW_TOKEN: AuthToken = { ...OLD_TOKEN, access_token: 'a2', refresh_token: 'r2' };

function makeSessionStore(
  token: AuthToken | null,
  { accessExpired = false, refreshExpired = false } = {},
): SessionStore & { setToken: jest.Mock; clear: jest.Mock } {
  let current = token;
  return {
    getToken: () => current,
    setToken: jest.fn((next: AuthToken) => {
      current = next;
      accessExpired = false;
    }),
    isAccessTokenExpired: () => accessExpired,
    isRefreshTokenExpired: () => refreshExpired,
    clear: jest.fn(() => {
      current = null;
    }),
  };
}

function makeAuthService(refresh: () => Promise<RefreshOutcome>): AuthService & { refresh: jest.Mock } {
  return { getStarted: jest.fn(), verify: jest.fn(), refresh: jest.fn(refresh) };
}

describe('createTokenProvider', () => {
  it('returns the stored access token without refreshing while it is still fresh', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'refreshed', token: NEW_TOKEN }));
    const provider = createTokenProvider(makeSessionStore(OLD_TOKEN), authService);

    expect(await provider.getFreshAccessToken()).toEqual({ status: 'ok', accessToken: 'a1' });
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('refreshes an expired access token and stores the new pair (the old refresh token is now revoked)', async () => {
    const sessionStore = makeSessionStore(OLD_TOKEN, { accessExpired: true });
    const authService = makeAuthService(() => Promise.resolve({ status: 'refreshed', token: NEW_TOKEN }));
    const provider = createTokenProvider(sessionStore, authService);

    expect(await provider.getFreshAccessToken()).toEqual({ status: 'ok', accessToken: 'a2' });
    expect(authService.refresh).toHaveBeenCalledWith('r1');
    expect(sessionStore.setToken).toHaveBeenCalledWith(NEW_TOKEN);
    expect(provider.peekAccessToken()).toBe('a2');
  });

  it('forceRefresh refreshes even a token that looks fresh', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'refreshed', token: NEW_TOKEN }));
    const provider = createTokenProvider(makeSessionStore(OLD_TOKEN), authService);

    expect(await provider.getFreshAccessToken({ forceRefresh: true })).toEqual({ status: 'ok', accessToken: 'a2' });
  });

  it('shares one in-flight refresh between concurrent callers', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'refreshed', token: NEW_TOKEN }));
    const provider = createTokenProvider(makeSessionStore(OLD_TOKEN, { accessExpired: true }), authService);

    const results = await Promise.all([provider.getFreshAccessToken(), provider.getFreshAccessToken()]);

    expect(authService.refresh).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { status: 'ok', accessToken: 'a2' },
      { status: 'ok', accessToken: 'a2' },
    ]);
  });

  it('a 401 from refresh clears the session and asks for reauth', async () => {
    const sessionStore = makeSessionStore(OLD_TOKEN, { accessExpired: true });
    const provider = createTokenProvider(sessionStore, makeAuthService(() => Promise.resolve({ status: 'reauth_required' })));

    expect(await provider.getFreshAccessToken()).toEqual({ status: 'reauth_required' });
    expect(sessionStore.clear).toHaveBeenCalled();
  });

  it('an expired refresh token asks for reauth without calling the server', async () => {
    const authService = makeAuthService(() => Promise.resolve({ status: 'refreshed', token: NEW_TOKEN }));
    const provider = createTokenProvider(
      makeSessionStore(OLD_TOKEN, { accessExpired: true, refreshExpired: true }),
      authService,
    );

    expect(await provider.getFreshAccessToken()).toEqual({ status: 'reauth_required' });
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('no session at all asks for reauth', async () => {
    const provider = createTokenProvider(makeSessionStore(null), makeAuthService(jest.fn()));

    expect(await provider.getFreshAccessToken()).toEqual({ status: 'reauth_required' });
  });

  it('a transient refresh failure keeps the session and reports failed', async () => {
    const sessionStore = makeSessionStore(OLD_TOKEN, { accessExpired: true });
    const provider = createTokenProvider(
      sessionStore,
      makeAuthService(() => Promise.resolve({ status: 'failed', error: new Error('503') })),
    );

    expect(await provider.getFreshAccessToken()).toMatchObject({ status: 'failed' });
    expect(sessionStore.clear).not.toHaveBeenCalled();
  });
});
