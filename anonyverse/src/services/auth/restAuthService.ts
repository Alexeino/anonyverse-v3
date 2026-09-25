import { Platform } from 'react-native';
import packageJson from '../../../package.json';
import { ApiError, postJson } from '../api/httpClient';
import type { AuthService } from './AuthService';
import type {
  AuthToken,
  GetStartedOutcome,
  GetStartedRequest,
  GetStartedResponse,
  RefreshOutcome,
  RefreshRequest,
  RefreshResponse,
  VerifyOutcome,
  VerifyRequest,
  VerifyResponse,
} from './types';

const APP_VERSION: string = packageJson.version;

function currentPlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

function isAuthToken(value: unknown): value is AuthToken {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const token = value as Partial<Record<keyof AuthToken, unknown>>;
  const isNonEmptyString = (v: unknown) => typeof v === 'string' && v.length > 0;
  const isPositiveNumber = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  return (
    isNonEmptyString(token.access_token) &&
    isNonEmptyString(token.refresh_token) &&
    isPositiveNumber(token.access_token_expiry) &&
    isPositiveNumber(token.refresh_token_expiry)
  );
}

/**
 * fetch-backed implementation of AuthService, calling the REST contract
 * documented in docs/api.md.
 */
export const restAuthService: AuthService = {
  async getStarted(deviceId: string | null): Promise<GetStartedOutcome> {
    const request: GetStartedRequest = {
      device_id: deviceId,
      app_version: APP_VERSION,
      platform: currentPlatform(),
    };

    try {
      const response = await postJson<GetStartedResponse>(
        '/api/v1/captcha/get-started',
        request,
      );

      // A known device is confirmed against the device_id we just sent, so
      // fall back to that when the response doesn't repeat it.
      const authenticatedDeviceId = response.device?.device_id ?? deviceId;

      if (response.verified && response.token && authenticatedDeviceId) {
        return {
          status: 'authenticated',
          deviceId: authenticatedDeviceId,
          token: response.token,
        };
      }

      return { status: 'verification_required' };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return { status: 'verification_required' };
      }
      return { status: 'failed', error };
    }
  },

  async verify(deviceId: string | null, token: string): Promise<VerifyOutcome> {
    const request: VerifyRequest = {
      device_id: deviceId,
      token,
      app_version: APP_VERSION,
      platform: currentPlatform(),
    };

    try {
      const response = await postJson<VerifyResponse>(
        '/api/v1/captcha/verify',
        request,
      );

      if (response.success && response.token && response.device) {
        return {
          status: 'authenticated',
          deviceId: response.device.device_id,
          token: response.token,
        };
      }

      return { status: 'failed' };
    } catch (error) {
      return { status: 'failed', error };
    }
  },

  async refresh(refreshToken: string): Promise<RefreshOutcome> {
    const request: RefreshRequest = { refresh_token: refreshToken };

    try {
      const token = await postJson<RefreshResponse>('/api/v1/jwt/refresh', request);
      // postJson only casts the body; a malformed token stored as-is would
      // make the expiry checks compute NaN and never refresh again.
      if (!isAuthToken(token)) {
        return { status: 'failed', error: new Error('Malformed /jwt/refresh response') };
      }
      return { status: 'refreshed', token };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return { status: 'reauth_required' };
      }
      return { status: 'failed', error };
    }
  },
};
