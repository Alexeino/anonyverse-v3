import { Platform } from 'react-native';
import packageJson from '../../../package.json';
import { ApiError, postJson } from '../api/httpClient';
import type { AuthService } from './AuthService';
import type {
  GetStartedOutcome,
  GetStartedRequest,
  GetStartedResponse,
  VerifyOutcome,
  VerifyRequest,
  VerifyResponse,
} from './types';

const APP_VERSION: string = packageJson.version;

function currentPlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/**
 * fetch-backed implementation of AuthService, calling the REST contract
 * documented in docs/api.md (verified live against localhost:8000 on
 * 2026-09-09 — see types.ts).
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

      // The backend only echoes `device` back when it's telling us a new
      // device_id (e.g. first time this device is seen); for an
      // already-known device it confirms verification without repeating
      // the id we just sent it, so fall back to that.
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
};
