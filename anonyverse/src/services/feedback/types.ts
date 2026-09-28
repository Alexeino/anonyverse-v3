/**
 * Shapes for POST /api/v1/feedback (anonyverse-core, feat/In-app-feedback).
 * The device is taken from the access token, never from the request body.
 */
export type FeedbackType = 'BUG' | 'FEATURE_REQUEST' | 'IMPROVEMENT' | 'GENERAL';

/** Mirrors FeedbackReason in anonyverse-core (services/feedback/reasons.py). */
export type FeedbackReason =
  | 'BUG_MESSAGES_NOT_SENT'
  | 'BUG_DISCONNECTED'
  | 'BUG_APP_FROZE'
  | 'BUG_TYPING_INDICATOR'
  | 'BUG_MATCH_TOO_SLOW'
  | 'BUG_STUCK_SEARCHING'
  | 'BUG_VERIFICATION_FAILED'
  | 'BUG_OTHER'
  | 'DISLIKE_BAD_MATCHES'
  | 'DISLIKE_RUDE_PARTNERS'
  | 'DISLIKE_TOO_SLOW'
  | 'DISLIKE_TOO_BUGGY'
  | 'DISLIKE_CONFUSING'
  | 'DISLIKE_OTHER'
  | 'IMPROVE_MATCHING'
  | 'IMPROVE_SPEED'
  | 'IMPROVE_DESIGN'
  | 'IMPROVE_STABILITY'
  | 'IMPROVE_MORE_TOPICS'
  | 'IMPROVE_OTHER'
  | 'WISH_SAVE_PARTNER'
  | 'WISH_SEND_MEDIA'
  | 'WISH_VOICE_CHAT'
  | 'WISH_MORE_TOPICS'
  | 'WISH_OTHER'
  | 'LOVE_ANONYMITY'
  | 'LOVE_MATCHES'
  | 'LOVE_DESIGN'
  | 'LOVE_SPEED'
  | 'LOVE_OTHER';

export type FeedbackTrigger = 'MANUAL' | 'CHAT_EXIT' | 'CHAT_LIST_PROMPT';

/** Mirrors the backend's max_length on `message`. */
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

/** Mirrors the backend's cap. */
export const MAX_FEEDBACK_REASONS = 10;

export interface FeedbackRequest {
  type: FeedbackType;
  message: string | null;
  reasons: FeedbackReason[];
  trigger: FeedbackTrigger | null;
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
  message: string | null;
  reasons: FeedbackReason[];
  trigger: FeedbackTrigger | null;
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
