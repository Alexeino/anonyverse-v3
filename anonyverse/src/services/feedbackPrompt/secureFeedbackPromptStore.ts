import EncryptedStorage from 'react-native-encrypted-storage';
import {
  INITIAL_FEEDBACK_PROMPT_STATE,
  type FeedbackPromptState,
  type FeedbackPromptStore,
} from './FeedbackPromptStore';

const STATE_KEY = 'anonyverse.feedback_prompt.state';
// Written by earlier versions, before the prompt rules existed.
const LEGACY_FIRST_CHAT_PROMPT_KEY = 'anonyverse.feedback_prompt.first_chat_shown';

function parseState(raw: string): FeedbackPromptState | null {
  try {
    // States saved before firstSkipPromptShown existed lack it.
    const value = { firstSkipPromptShown: false, ...JSON.parse(raw) };
    if (
      typeof value.firstChatPromptShown === 'boolean' &&
      typeof value.firstSkipPromptShown === 'boolean' &&
      (value.lastShownAt === null || typeof value.lastShownAt === 'number') &&
      typeof value.dismissalsInARow === 'number' &&
      (value.lastSubmittedAt === null || typeof value.lastSubmittedAt === 'number')
    ) {
      return value;
    }
  } catch {}
  return null;
}

export const secureFeedbackPromptStore: FeedbackPromptStore = {
  async load() {
    try {
      const raw = await EncryptedStorage.getItem(STATE_KEY);
      if (raw) {
        return parseState(raw) ?? INITIAL_FEEDBACK_PROMPT_STATE;
      }
      const legacyShown = (await EncryptedStorage.getItem(LEGACY_FIRST_CHAT_PROMPT_KEY)) === 'true';
      return { ...INITIAL_FEEDBACK_PROMPT_STATE, firstChatPromptShown: legacyShown };
    } catch {
      return null;
    }
  },

  async save(state) {
    try {
      await EncryptedStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {}
  },

  async reset() {
    try {
      await EncryptedStorage.removeItem(STATE_KEY);
      await EncryptedStorage.removeItem(LEGACY_FIRST_CHAT_PROMPT_KEY);
    } catch {}
  },
};
