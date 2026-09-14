import type { AuthToken } from '../auth/types';

/**
 * Abstraction over in-app storage of the current session's auth token.
 * Screens/hooks must depend on this interface, never a concrete backing
 * store, so callers reaching for "the current access token" (e.g. the
 * matchmaking socket connection) don't need to know how/where it was
 * captured (Entry's get-started call vs. Verification's verify call).
 */
export interface SessionStore {
  /** Returns the most recently stored token, or null if none has been set yet this session. */
  getToken(): AuthToken | null;

  /** Stores the token issued by get-started/verify. */
  setToken(token: AuthToken): void;

  /** Clears the stored token (e.g. on logout/device revocation, once that exists). */
  clear(): void;
}
