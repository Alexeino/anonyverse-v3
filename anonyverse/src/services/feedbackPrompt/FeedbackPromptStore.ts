export interface FeedbackPromptState {
  /** The first-chat prompt has been shown (or the user has already given feedback). */
  firstChatPromptShown: boolean;
  /** The prompt after the user's first skip has been shown. */
  firstSkipPromptShown: boolean;
  /** When an automatic prompt last appeared (ms since epoch). */
  lastShownAt: number | null;
  /** Automatic prompts closed without sending, in a row. */
  dismissalsInARow: number;
  /** When the user last sent feedback, from any entry point. */
  lastSubmittedAt: number | null;
}

export const INITIAL_FEEDBACK_PROMPT_STATE: FeedbackPromptState = {
  firstChatPromptShown: false,
  firstSkipPromptShown: false,
  lastShownAt: null,
  dismissalsInARow: 0,
  lastSubmittedAt: null,
};

export interface FeedbackPromptStore {
  /** Null when the saved state can't be read; callers then skip automatic prompts. */
  load(): Promise<FeedbackPromptState | null>;
  save(state: FeedbackPromptState): Promise<void>;
  reset(): Promise<void>;
}
