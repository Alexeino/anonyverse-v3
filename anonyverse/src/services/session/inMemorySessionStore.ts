import type { AuthToken } from '../auth/types';
import type { SessionStore } from './SessionStore';

/**
 * In-memory implementation of SessionStore. Intentionally not persisted —
 * the token is short-lived and, unlike the device ID, there's no
 * requirement yet for it to survive an app restart (a cold start always
 * re-derives it via Entry's get-started call or a fresh Verification).
 */
let currentToken: AuthToken | null = null;
// The *_expiry fields are durations in seconds from issuance (OAuth-style
// expires_in), not absolute timestamps — so the issuance time has to be
// captured alongside the token to know when it actually goes stale.
let issuedAtMs: number | null = null;

function expiresWithin(expirySeconds: number, marginMs: number): boolean {
  if (issuedAtMs === null) {
    return true;
  }
  return Date.now() + marginMs >= issuedAtMs + expirySeconds * 1000;
}

export const inMemorySessionStore: SessionStore = {
  getToken() {
    return currentToken;
  },

  setToken(token: AuthToken) {
    currentToken = token;
    issuedAtMs = Date.now();
  },

  isAccessTokenExpired(marginMs = 0) {
    return !currentToken || expiresWithin(currentToken.access_token_expiry, marginMs);
  },

  isRefreshTokenExpired() {
    return !currentToken || expiresWithin(currentToken.refresh_token_expiry, 0);
  },

  clear() {
    currentToken = null;
    issuedAtMs = null;
  },
};
