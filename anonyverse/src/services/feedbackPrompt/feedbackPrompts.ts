import type { FeedbackTrigger } from '../feedback/types';
import type { FeedbackPromptStore } from './FeedbackPromptStore';
import { recordFeedbackClosed, recordPromptShown, shouldPromptOnChatList } from './feedbackPromptRules';

const AUTOMATIC_TRIGGERS: ReadonlySet<FeedbackTrigger> = new Set(['CHAT_EXIT', 'CHAT_LIST_PROMPT']);

// Each call loads, changes and saves the whole state; running them one at a
// time stops a quick close from overwriting the "shown" update before it.
let pending: Promise<unknown> = Promise.resolve();

function inOrder<T>(task: () => Promise<T>): Promise<T> {
  const run = pending.then(task, task);
  pending = run.catch(() => undefined);
  return run;
}

/** Records the chat-list prompt as shown and returns true if the rules allow it now. */
export function claimChatListPrompt(store: FeedbackPromptStore, now = Date.now()): Promise<boolean> {
  return inOrder(async () => {
    const state = await store.load();
    if (!state || !shouldPromptOnChatList(state, now)) {
      return false;
    }
    await store.save(recordPromptShown(state, now));
    return true;
  });
}

/** Records the first-skip prompt as shown and returns true if it hasn't been shown before. */
export function claimFirstSkipPrompt(store: FeedbackPromptStore, now = Date.now()): Promise<boolean> {
  return inOrder(async () => {
    const state = await store.load();
    if (!state || state.firstSkipPromptShown) {
      return false;
    }
    await store.save({ ...recordPromptShown(state, now), firstSkipPromptShown: true });
    return true;
  });
}

/** The leave-chat form always shows, but counts as a prompt so the chat list doesn't stack another. */
export function markExitPromptShown(store: FeedbackPromptStore, now = Date.now()): Promise<void> {
  return inOrder(async () => {
    const state = await store.load();
    if (state) {
      await store.save(recordPromptShown(state, now));
    }
  });
}

export function recordFeedbackSheetClosed(
  store: FeedbackPromptStore,
  trigger: FeedbackTrigger | undefined,
  submitted: boolean,
  now = Date.now(),
): Promise<void> {
  return inOrder(async () => {
    const state = await store.load();
    if (state) {
      const automatic = trigger !== undefined && AUTOMATIC_TRIGGERS.has(trigger);
      await store.save(recordFeedbackClosed(state, { submitted, automatic }, now));
    }
  });
}
