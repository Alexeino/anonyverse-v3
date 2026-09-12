/**
 * Shapes for POST /api/v1/captcha/get-started, per docs/api.md
 * ("Reverse-engineered from the client app (anonyverse-v2)").
 * The live backend (verified 2026-09-09 against localhost:8000) returns
 * `token: null` rather than omitting it when unverified; `device` is
 * omitted in that case. It's also omitted when verified: true for an
 * already-known device (device_exists: true) — the response simply
 * confirms the device_id that was sent in the request rather than
 * repeating it, so callers must fall back to the request's device_id
 * when `device` is absent (see restAuthService.ts).
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
  token?: AuthToken;
  device?: {
    device_id: string;
    platform: string;
    app_version: string;
  };
}

export type VerifyOutcome =
  | { status: 'authenticated'; deviceId: string; token: AuthToken }
  | { status: 'failed'; error?: unknown };
