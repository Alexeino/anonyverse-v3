import type { GetStartedOutcome, VerifyOutcome } from './types';

/** Abstraction over the auth/bootstrap REST calls, so screens/hooks never call fetch directly. */
export interface AuthService {
  /**
   * POST /api/v1/captcha/get-started — checks whether `deviceId` (or no
   * device at all, on first launch) is already known/verified.
   */
  getStarted(deviceId: string | null): Promise<GetStartedOutcome>;

  /**
   * POST /api/v1/captcha/verify — submits a completed Turnstile challenge
   * token to verify the device as human and issue session tokens.
   */
  verify(deviceId: string | null, token: string): Promise<VerifyOutcome>;
}
