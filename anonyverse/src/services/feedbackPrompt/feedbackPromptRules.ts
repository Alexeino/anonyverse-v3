import type { FeedbackPromptState } from './FeedbackPromptStore';

const DAY_MS = 24 * 60 * 60 * 1000;

/** At most one automatic chat-list prompt per this window. */
export const PROMPT_COOLDOWN_MS = 7 * DAY_MS;
/** Quiet period after the user sends feedback, or dismisses prompts twice in a row. */
export const PROMPT_QUIET_MS = 30 * DAY_MS;
export const MAX_DISMISSALS_IN_A_ROW = 2;

function within(since: number | null, windowMs: number, now: number): boolean {
  return since !== null && now - since < windowMs;
}

/** Whether the chat list should pop the feedback sheet after a chat ends. */
export function shouldPromptOnChatList(state: FeedbackPromptState, now: number): boolean {
  if (!state.firstChatPromptShown) {
    return true;
  }
  if (within(state.lastSubmittedAt, PROMPT_QUIET_MS, now)) {
    return false;
  }
  if (state.dismissalsInARow >= MAX_DISMISSALS_IN_A_ROW && within(state.lastShownAt, PROMPT_QUIET_MS, now)) {
    return false;
  }
  return !within(state.lastShownAt, PROMPT_COOLDOWN_MS, now);
}

export function recordPromptShown(state: FeedbackPromptState, now: number): FeedbackPromptState {
  return { ...state, firstChatPromptShown: true, lastShownAt: now };
}

/**
 * Sending feedback from anywhere starts the quiet period; only automatic
 * prompts count towards dismissals.
 */
export function recordFeedbackClosed(
  state: FeedbackPromptState,
  { submitted, automatic }: { submitted: boolean; automatic: boolean },
  now: number,
): FeedbackPromptState {
  if (submitted) {
    return { ...state, firstChatPromptShown: true, lastSubmittedAt: now, dismissalsInARow: 0 };
  }
  return automatic ? { ...state, dismissalsInARow: state.dismissalsInARow + 1 } : state;
}
