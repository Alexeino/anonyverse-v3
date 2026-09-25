import type { AuthService } from '../auth/AuthService';
import { restAuthService } from '../auth/restAuthService';
import { inMemorySessionStore } from './inMemorySessionStore';
import type { SessionStore } from './SessionStore';

/** Refresh this long before the access token actually expires, so a handshake never races its expiry. */
const ACCESS_TOKEN_EXPIRY_MARGIN_MS = 60_000;

export type AccessTokenResult =
  | { status: 'ok'; accessToken: string }
  /** No usable refresh token — only get-started/captcha (via Entry) can issue a new session. */
  | { status: 'reauth_required' }
  /** The refresh call failed transiently (429/5xx/network) — worth retrying. */
  | { status: 'failed'; error?: unknown };

export interface TokenProvider {
  /**
   * Returns a usable access token, refreshing first when it's expired or
   * about to be (or always, with `forceRefresh` — e.g. after the socket
   * handshake was refused with invalid_token).
   */
  getFreshAccessToken(options?: { forceRefresh?: boolean }): Promise<AccessTokenResult>;

  /** The stored access token as-is, for the socket handshake's auth callback. */
  peekAccessToken(): string | null;
}

export function createTokenProvider(sessionStore: SessionStore, authService: AuthService): TokenProvider {
  // Each refresh revokes the refresh token it was given, so two refreshes
  // in parallel would leave one of them holding a revoked token. Every
  // caller shares the one in flight instead.
  let inFlightRefresh: Promise<AccessTokenResult> | null = null;

  async function refresh(): Promise<AccessTokenResult> {
    const token = sessionStore.getToken();
    if (!token || sessionStore.isRefreshTokenExpired()) {
      sessionStore.clear();
      return { status: 'reauth_required' };
    }

    const outcome = await authService.refresh(token.refresh_token);
    switch (outcome.status) {
      case 'refreshed':
        sessionStore.setToken(outcome.token);
        return { status: 'ok', accessToken: outcome.token.access_token };
      case 'reauth_required':
        sessionStore.clear();
        return { status: 'reauth_required' };
      case 'failed':
        return { status: 'failed', error: outcome.error };
    }
  }

  return {
    getFreshAccessToken({ forceRefresh = false } = {}) {
      const token = sessionStore.getToken();
      if (!token) {
        return Promise.resolve({ status: 'reauth_required' });
      }
      if (!forceRefresh && !sessionStore.isAccessTokenExpired(ACCESS_TOKEN_EXPIRY_MARGIN_MS)) {
        return Promise.resolve({ status: 'ok', accessToken: token.access_token });
      }
      if (!inFlightRefresh) {
        inFlightRefresh = refresh().finally(() => {
          inFlightRefresh = null;
        });
      }
      return inFlightRefresh;
    },

    peekAccessToken() {
      return sessionStore.getToken()?.access_token ?? null;
    },
  };
}

export const tokenProvider: TokenProvider = createTokenProvider(inMemorySessionStore, restAuthService);
