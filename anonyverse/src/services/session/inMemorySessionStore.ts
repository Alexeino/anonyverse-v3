import type { AuthToken } from '../auth/types';
import type { SessionStore } from './SessionStore';

/**
 * In-memory implementation of SessionStore. Intentionally not persisted —
 * the token is short-lived and, unlike the device ID, there's no
 * requirement yet for it to survive an app restart (a cold start always
 * re-derives it via Entry's get-started call or a fresh Verification).
 */
let currentToken: AuthToken | null = null;
// access_token_expiry is a duration in seconds from issuance (OAuth-style
// expires_in), not an absolute timestamp — so the issuance time has to be
// captured alongside the token to know when it actually goes stale.
let issuedAtMs: number | null = null;

export const inMemorySessionStore: SessionStore = {
  getToken() {
    if (currentToken && issuedAtMs !== null) {
      const expiresAtMs = issuedAtMs + currentToken.access_token_expiry * 1000;
      if (Date.now() >= expiresAtMs) {
        currentToken = null;
        issuedAtMs = null;
      }
    }
    return currentToken;
  },

  setToken(token: AuthToken) {
    currentToken = token;
    issuedAtMs = Date.now();
  },

  clear() {
    currentToken = null;
    issuedAtMs = null;
  },
};
