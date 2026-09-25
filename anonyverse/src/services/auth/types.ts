/**
 * Shapes for POST /api/v1/captcha/get-started, per docs/api.md. `token`
 * is null when unverified. The contract has no `device` in this response
 * — a known device is confirmed against the device_id sent in the
 * request — but it's still read if present (see restAuthService.ts).
 */
export interface GetStartedRequest {
  device_id: string | null;
  app_version: string;
  platform: 'ios' | 'android';
}

export interface AuthToken {
  access_token: string;
  refresh_token: string;
  access_token_expiry: number;
  refresh_token_expiry: number;
}

export interface GetStartedResponse {
  device_exists: boolean;
  verified: boolean;
  token: AuthToken | null;
  device?: {
    device_id: string;
  };
}

export type GetStartedOutcome =
  | { status: 'authenticated'; deviceId: string; token: AuthToken }
  | { status: 'verification_required' }
  | { status: 'failed'; error: unknown };

/** POST /api/v1/captcha/verify — submits a completed Turnstile token. */
export interface VerifyRequest {
  device_id: string | null;
  token: string;
  platform: 'ios' | 'android';
  app_version: string;
}

export interface VerifyResponse {
  success: boolean;
  token: AuthToken | null;
  device: {
    device_id: string;
    platform: string;
    app_version: string;
  } | null;
}

export type VerifyOutcome =
  | { status: 'authenticated'; deviceId: string; token: AuthToken }
  | { status: 'failed'; error?: unknown };

/**
 * POST /api/v1/jwt/refresh. Each refresh revokes the refresh token that
 * was sent, so the returned pair must replace the stored one.
 */
export interface RefreshRequest {
  refresh_token: string;
}

export type RefreshResponse = AuthToken;

export type RefreshOutcome =
  | { status: 'refreshed'; token: AuthToken }
  /** 401: the refresh token was revoked or expired — only get-started/captcha can issue a new one. */
  | { status: 'reauth_required' }
  /** 429/5xx/network — worth retrying with backoff. */
  | { status: 'failed'; error: unknown };
