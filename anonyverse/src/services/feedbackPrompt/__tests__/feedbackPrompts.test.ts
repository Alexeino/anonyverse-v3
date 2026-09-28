import {
  INITIAL_FEEDBACK_PROMPT_STATE,
  type FeedbackPromptState,
  type FeedbackPromptStore,
} from '../FeedbackPromptStore';
import {
  PROMPT_COOLDOWN_MS,
  PROMPT_QUIET_MS,
  recordFeedbackClosed,
  recordPromptShown,
  shouldPromptOnChatList,
} from '../feedbackPromptRules';
import {
  claimChatListPrompt,
  claimFirstSkipPrompt,
  markExitPromptShown,
  recordFeedbackSheetClosed,
} from '../feedbackPrompts';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function state(overrides: Partial<FeedbackPromptState> = {}): FeedbackPromptState {
  return { ...INITIAL_FEEDBACK_PROMPT_STATE, firstChatPromptShown: true, ...overrides };
}

function memoryStore(initial: FeedbackPromptState | null = INITIAL_FEEDBACK_PROMPT_STATE) {
  let current = initial;
  const store: FeedbackPromptStore = {
    load: jest.fn(() => Promise.resolve(current)),
    save: jest.fn((next: FeedbackPromptState) => {
      current = next;
      return Promise.resolve();
    }),
    reset: jest.fn(() => {
      current = INITIAL_FEEDBACK_PROMPT_STATE;
      return Promise.resolve();
    }),
  };
  return { store, get current() { return current; } };
}

describe('shouldPromptOnChatList', () => {
  it('prompts after the very first chat', () => {
    expect(shouldPromptOnChatList(INITIAL_FEEDBACK_PROMPT_STATE, NOW)).toBe(true);
  });

  it('waits 7 days between prompts', () => {
    expect(shouldPromptOnChatList(state({ lastShownAt: NOW - 6 * DAY }), NOW)).toBe(false);
    expect(shouldPromptOnChatList(state({ lastShownAt: NOW - PROMPT_COOLDOWN_MS }), NOW)).toBe(true);
  });

  it('stays quiet for 30 days after feedback is sent', () => {
    const sent = state({ lastShownAt: NOW - 10 * DAY, lastSubmittedAt: NOW - 10 * DAY });
    expect(shouldPromptOnChatList(sent, NOW)).toBe(false);
    expect(shouldPromptOnChatList(sent, NOW - 10 * DAY + PROMPT_QUIET_MS)).toBe(true);
  });

  it('stays quiet for 30 days after two dismissals in a row', () => {
    const dismissed = state({ lastShownAt: NOW - 10 * DAY, dismissalsInARow: 2 });
    expect(shouldPromptOnChatList(dismissed, NOW)).toBe(false);
    expect(shouldPromptOnChatList(dismissed, NOW - 10 * DAY + PROMPT_QUIET_MS)).toBe(true);
    expect(shouldPromptOnChatList({ ...dismissed, dismissalsInARow: 1 }, NOW)).toBe(true);
  });
});

describe('recordFeedbackClosed', () => {
  it('sending resets dismissals and starts the quiet period', () => {
    const next = recordFeedbackClosed(state({ dismissalsInARow: 1 }), { submitted: true, automatic: false }, NOW);
    expect(next).toMatchObject({ dismissalsInARow: 0, lastSubmittedAt: NOW, firstChatPromptShown: true });
  });

  it('only automatic prompts count as dismissals', () => {
    expect(recordFeedbackClosed(state(), { submitted: false, automatic: true }, NOW).dismissalsInARow).toBe(1);
    expect(recordFeedbackClosed(state(), { submitted: false, automatic: false }, NOW).dismissalsInARow).toBe(0);
  });

  it('marks a prompt as shown', () => {
    expect(recordPromptShown(INITIAL_FEEDBACK_PROMPT_STATE, NOW)).toMatchObject({
      firstChatPromptShown: true,
      lastShownAt: NOW,
    });
  });
});

describe('feedbackPrompts', () => {
  it('claims the first chat-list prompt once, then not again within the cooldown', async () => {
    const memory = memoryStore();

    await expect(claimChatListPrompt(memory.store, NOW)).resolves.toBe(true);
    expect(memory.current?.lastShownAt).toBe(NOW);
    await expect(claimChatListPrompt(memory.store, NOW + DAY)).resolves.toBe(false);
  });

  it('never prompts when the saved state cannot be read', async () => {
    const memory = memoryStore(null);

    await expect(claimChatListPrompt(memory.store, NOW)).resolves.toBe(false);
    expect(memory.store.save).not.toHaveBeenCalled();
  });

  it('a leave-chat form counts as shown, so the chat list does not stack another prompt', async () => {
    const memory = memoryStore();

    await markExitPromptShown(memory.store, NOW);

    await expect(claimChatListPrompt(memory.store, NOW + DAY)).resolves.toBe(false);
  });

  it('two dismissed automatic prompts silence the chat list for 30 days; manual ones do not count', async () => {
    const memory = memoryStore(state());

    await recordFeedbackSheetClosed(memory.store, 'CHAT_EXIT', false, NOW);
    await recordFeedbackSheetClosed(memory.store, 'MANUAL', false, NOW);
    expect(memory.current?.dismissalsInARow).toBe(1);
    await recordFeedbackSheetClosed(memory.store, 'CHAT_LIST_PROMPT', false, NOW);
    await markExitPromptShown(memory.store, NOW);

    await expect(claimChatListPrompt(memory.store, NOW + 8 * DAY)).resolves.toBe(false);
    await expect(claimChatListPrompt(memory.store, NOW + PROMPT_QUIET_MS)).resolves.toBe(true);
  });

  it('claims the first-skip prompt only once', async () => {
    const memory = memoryStore(state());

    await expect(claimFirstSkipPrompt(memory.store, NOW)).resolves.toBe(true);
    expect(memory.current).toMatchObject({ firstSkipPromptShown: true, lastShownAt: NOW });
    await expect(claimFirstSkipPrompt(memory.store, NOW + 60 * DAY)).resolves.toBe(false);
  });

  it('never shows the first-skip prompt when the saved state cannot be read', async () => {
    await expect(claimFirstSkipPrompt(memoryStore(null).store, NOW)).resolves.toBe(false);
  });

  it('runs updates in order, so a quick close cannot overwrite the "shown" update', async () => {
    let current: FeedbackPromptState = state();
    const slowStore: FeedbackPromptStore = {
      // A slow load gives an overlapping call the chance to read stale state.
      load: () => new Promise(resolve => setTimeout(() => resolve(current), 5)),
      save: next => {
        current = next;
        return Promise.resolve();
      },
      reset: () => Promise.resolve(),
    };

    await Promise.all([
      markExitPromptShown(slowStore, NOW),
      recordFeedbackSheetClosed(slowStore, 'CHAT_EXIT', false, NOW),
    ]);

    expect(current).toMatchObject({ lastShownAt: NOW, dismissalsInARow: 1 });
  });
});
