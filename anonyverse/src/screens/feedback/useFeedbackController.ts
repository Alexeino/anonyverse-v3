import { useCallback, useRef, useState } from 'react';
import { useAnalyticsCapture } from '../../hooks/usePosthogHooks';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  type FeedbackOutcome,
  type FeedbackSubmission,
  type FeedbackType,
} from '../../services/feedback/types';
import type { AccessTokenResult, TokenProvider } from '../../services/session/tokenProvider';

export type FeedbackPhase = 'editing' | 'submitting' | 'submitted';

export type FeedbackErrorReason = Exclude<FeedbackOutcome['status'], 'submitted'>;

export interface FeedbackDefaults {
  type?: FeedbackType;
  /** Screen the user came from, e.g. "ChatListScreen". Stored with the feedback. */
  screen?: string;
}

export interface UseFeedbackControllerResult {
  phase: FeedbackPhase;
  type: FeedbackType;
  message: string;
  rating: number | null;
  /** Trimmed length, which is what the backend validates. */
  messageLength: number;
  isMessageTooLong: boolean;
  canSubmit: boolean;
  error: FeedbackErrorReason | null;
  setType: (type: FeedbackType) => void;
  setMessage: (message: string) => void;
  /** Tapping the selected rating again clears it — rating is optional. */
  toggleRating: (rating: number) => void;
  submit: () => Promise<void>;
}

export const FEEDBACK_ERROR_MESSAGES: Record<FeedbackErrorReason, string> = {
  unauthorized: 'Your session has expired. Please restart the app and try again.',
  blocked: "This device can't send feedback right now.",
  rate_limited: "You've sent a lot of feedback recently. Please try again in a few minutes.",
  invalid: 'Something in your feedback looks off. Please check it and try again.',
  failed: "We couldn't send your feedback. Check your connection and try again.",
};

function tokenFailureOutcome(
  result: Exclude<AccessTokenResult, { status: 'ok' }>,
): FeedbackOutcome {
  // reauth_required means the session is gone for good; anything else was a
  // transient refresh failure, which reads the same as a failed send.
  return result.status === 'reauth_required'
    ? { status: 'unauthorized' }
    : { status: 'failed', error: result.error };
}

/**
 * Submits with a fresh access token (refreshing it first if it's expired).
 * If the backend still answers 401, the token was rejected despite looking
 * valid, so force one refresh and retry once.
 */
async function submitWithFreshToken(
  tokenProvider: TokenProvider,
  feedbackService: FeedbackService,
  submission: FeedbackSubmission,
): Promise<FeedbackOutcome> {
  const token = await tokenProvider.getFreshAccessToken();
  if (token.status !== 'ok') {
    return tokenFailureOutcome(token);
  }

  const outcome = await feedbackService.submit(submission, token.accessToken);
  if (outcome.status !== 'unauthorized') {
    return outcome;
  }

  const refreshed = await tokenProvider.getFreshAccessToken({ forceRefresh: true });
  if (refreshed.status !== 'ok') {
    return tokenFailureOutcome(refreshed);
  }
  return feedbackService.submit(submission, refreshed.accessToken);
}

export function useFeedbackController(
  defaults: FeedbackDefaults,
  tokenProvider: TokenProvider,
  feedbackService: FeedbackService,
): UseFeedbackControllerResult {
  const [phase, setPhase] = useState<FeedbackPhase>('editing');
  const [type, setType] = useState<FeedbackType>(defaults.type ?? 'GENERAL');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [error, setError] = useState<FeedbackErrorReason | null>(null);
  // Guards against a double tap firing two requests before the phase
  // update re-renders the button as loading.
  const submittingRef = useRef(false);
  const captureAnalytics = useAnalyticsCapture();

  const messageLength = message.trim().length;
  const isMessageTooLong = messageLength > FEEDBACK_MESSAGE_MAX_LENGTH;
  const canSubmit = phase === 'editing' && messageLength > 0 && !isMessageTooLong;

  const toggleRating = useCallback((value: number) => {
    setRating(current => (current === value ? null : value));
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setError(null);
    setPhase('submitting');

    const outcome = await submitWithFreshToken(tokenProvider, feedbackService, {
      type,
      message: message.trim(),
      rating,
      screen: defaults.screen ?? null,
    });

    submittingRef.current = false;

    if (outcome.status === 'submitted') {
      // Never send the message itself to analytics — it's free text and
      // may contain personal information.
      captureAnalytics('feedback_submitted', {
        type,
        has_rating: rating !== null,
        screen: defaults.screen ?? null,
      });
      setPhase('submitted');
      return;
    }

    if (outcome.status === 'failed') {
      console.error('[Feedback] Submission failed.', outcome.error);
    }
    setError(outcome.status);
    // Back to editing so the typed message is kept and the user can retry.
    setPhase('editing');
  }, [canSubmit, tokenProvider, feedbackService, type, message, rating, defaults.screen, captureAnalytics]);

  return {
    phase,
    type,
    message,
    rating,
    messageLength,
    isMessageTooLong,
    canSubmit,
    error,
    setType,
    setMessage,
    toggleRating,
    submit,
  };
}
