/**
 * Shapes for POST /api/v1/feedback (anonyverse-core, feat/In-app-feedback).
 * The device is taken from the access token, never from the request body.
 */
export type FeedbackType = 'BUG' | 'FEATURE_REQUEST' | 'IMPROVEMENT' | 'GENERAL';

/** Mirrors the backend's max_length on `message`. */
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

export interface FeedbackRequest {
  type: FeedbackType;
  message: string;
  rating: number | null;
  screen: string | null;
  os_version: string | null;
}

export interface FeedbackResponse {
  id: number;
  status: string;
  created_at: string;
}

export interface FeedbackSubmission {
  type: FeedbackType;
  message: string;
  rating: number | null;
  screen: string | null;
}

export type FeedbackOutcome =
  | { status: 'submitted'; id: number }
  /** No usable access token (missing, expired, or rejected with 401). */
  | { status: 'unauthorized' }
  /** 403 — the device is blocked. */
  | { status: 'blocked' }
  /** 429 — too many submissions in the rate-limit window. */
  | { status: 'rate_limited' }
  /** 422 — the backend rejected the input. */
  | { status: 'invalid' }
  | { status: 'failed'; error: unknown };
