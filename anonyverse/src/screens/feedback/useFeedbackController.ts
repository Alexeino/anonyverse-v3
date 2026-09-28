import { useCallback, useRef, useState } from 'react';
import { useAnalyticsCapture } from '../../hooks/usePosthogHooks';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  MAX_FEEDBACK_REASONS,
  type FeedbackOutcome,
  type FeedbackReason,
  type FeedbackSubmission,
  type FeedbackTrigger,
  type FeedbackType,
} from '../../services/feedback/types';
import type { AccessTokenResult, TokenProvider } from '../../services/session/tokenProvider';
import { bugReasonsForScreen, ratingFollowUp } from './feedbackOptions';

export type FeedbackStep = 'question' | 'bug' | 'rating' | 'submitted';

export type FeedbackErrorReason = Exclude<FeedbackOutcome['status'], 'submitted'>;

export interface FeedbackDefaults {
  /** 'BUG' opens straight on the bug options. */
  type?: FeedbackType;
  /** Screen the user came from; picks the bug options. */
  screen?: string;
  /** Defaults to MANUAL. */
  trigger?: FeedbackTrigger;
}

export interface UseFeedbackControllerResult {
  step: FeedbackStep;
  submitting: boolean;
  rating: number | null;
  reasons: FeedbackReason[];
  reasonOptions: FeedbackReason[];
  followUpQuestion: string | null;
  message: string;
  /** Trimmed length, which is what the backend validates. */
  messageLength: number;
  isMessageTooLong: boolean;
  canSubmit: boolean;
  error: FeedbackErrorReason | null;
  answerSomethingWrong: (wentWrong: boolean) => void;
  setRating: (rating: number) => void;
  toggleReason: (reason: FeedbackReason) => void;
  setMessage: (message: string) => void;
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
  const [step, setStep] = useState<FeedbackStep>(defaults.type === 'BUG' ? 'bug' : 'question');
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRatingState] = useState<number | null>(null);
  const [reasons, setReasons] = useState<FeedbackReason[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<FeedbackErrorReason | null>(null);
  // Blocks a double tap before the re-render disables the button.
  const submittingRef = useRef(false);
  const captureAnalytics = useAnalyticsCapture();

  const followUp = rating === null ? null : ratingFollowUp(rating);
  const reasonOptions =
    step === 'bug' ? bugReasonsForScreen(defaults.screen) : followUp?.reasons ?? [];
  const trimmedMessage = message.trim();
  const messageLength = trimmedMessage.length;
  const isMessageTooLong = messageLength > FEEDBACK_MESSAGE_MAX_LENGTH;
  const hasAnswer =
    step === 'bug' ? reasons.length > 0 || messageLength > 0 : step === 'rating' && rating !== null;
  const canSubmit = hasAnswer && !isMessageTooLong && !submitting;

  const answerSomethingWrong = useCallback((wentWrong: boolean) => {
    setError(null);
    setStep(wentWrong ? 'bug' : 'rating');
  }, []);

  const setRating = useCallback(
    (value: number) => {
      // Options don't carry over between rating bands.
      if (rating === null || ratingFollowUp(rating).question !== ratingFollowUp(value).question) {
        setReasons([]);
      }
      setRatingState(value);
    },
    [rating],
  );

  const toggleReason = useCallback((reason: FeedbackReason) => {
    setReasons(current => {
      if (current.includes(reason)) {
        return current.filter(r => r !== reason);
      }
      return current.length >= MAX_FEEDBACK_REASONS ? current : [...current, reason];
    });
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit || submittingRef.current) {
      return;
    }

    const type: FeedbackType = step === 'bug' ? 'BUG' : followUp?.type ?? 'GENERAL';
    const trigger = defaults.trigger ?? 'MANUAL';
    submittingRef.current = true;
    setError(null);
    setSubmitting(true);

    const outcome = await submitWithFreshToken(tokenProvider, feedbackService, {
      type,
      message: trimmedMessage || null,
      reasons,
      trigger,
      rating: step === 'rating' ? rating : null,
      screen: defaults.screen ?? null,
    });

    submittingRef.current = false;
    setSubmitting(false);

    if (outcome.status === 'submitted') {
      // Never send the message itself to analytics — it's free text and
      // may contain personal information.
      captureAnalytics('feedback_submitted', {
        type,
        trigger,
        reasons,
        has_rating: step === 'rating',
        has_message: trimmedMessage.length > 0,
        screen: defaults.screen ?? null,
      });
      setStep('submitted');
      return;
    }

    if (outcome.status === 'failed') {
      console.error('[Feedback] Submission failed.', outcome.error);
    }
    setError(outcome.status);
  }, [
    canSubmit,
    step,
    followUp,
    defaults.trigger,
    defaults.screen,
    tokenProvider,
    feedbackService,
    trimmedMessage,
    reasons,
    rating,
    captureAnalytics,
  ]);

  return {
    step,
    submitting,
    rating,
    reasons,
    reasonOptions,
    followUpQuestion: followUp?.question ?? null,
    message,
    messageLength,
    isMessageTooLong,
    canSubmit,
    error,
    answerSomethingWrong,
    setRating,
    toggleReason,
    setMessage,
    submit,
  };
}
