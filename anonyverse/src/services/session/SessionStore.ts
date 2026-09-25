import type { AuthToken } from '../auth/types';

/**
 * Abstraction over in-app storage of the current session's auth token.
 * Screens/hooks must depend on this interface, never a concrete backing
 * store, so callers reaching for "the current access token" (e.g. the
 * matchmaking socket connection) don't need to know how/where it was
 * captured (Entry's get-started call, Verification's verify call, or a
 * refresh).
 */
export interface SessionStore {
  /**
   * Returns the most recently stored token pair, or null if none has been
   * set yet this session. The pair is returned even once the access token
   * has expired, since its refresh token may still be good — check
   * isAccessTokenExpired() before using the access token.
   */
  getToken(): AuthToken | null;

  /** Stores the token issued by get-started/verify/refresh, starting its expiry clocks now. */
  setToken(token: AuthToken): void;

  /** True when there's no token, or its access token expires within `marginMs`. */
  isAccessTokenExpired(marginMs?: number): boolean;

  /** True when there's no token, or its refresh token has expired. */
  isRefreshTokenExpired(): boolean;

  /** Clears the stored token (e.g. once the refresh token is revoked). */
  clear(): void;
}
