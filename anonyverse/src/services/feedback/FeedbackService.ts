import type { FeedbackOutcome, FeedbackSubmission } from './types';

/**
 * Abstraction over submitting in-app feedback. Screens/hooks depend on this
 * interface, not the fetch-backed implementation, so they can be tested
 * without a network.
 */
export interface FeedbackService {
  /** Submits feedback as the device that owns `accessToken`. */
  submit(submission: FeedbackSubmission, accessToken: string): Promise<FeedbackOutcome>;
}
