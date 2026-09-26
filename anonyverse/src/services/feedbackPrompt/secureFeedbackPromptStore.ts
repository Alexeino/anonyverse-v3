import EncryptedStorage from 'react-native-encrypted-storage';
import type { FeedbackPromptStore } from './FeedbackPromptStore';

const FIRST_CHAT_PROMPT_KEY = 'anonyverse.feedback_prompt.first_chat_shown';

export const secureFeedbackPromptStore: FeedbackPromptStore = {
  async hasShownFirstChatPrompt() {
    try {
      return (await EncryptedStorage.getItem(FIRST_CHAT_PROMPT_KEY)) === 'true';
    } catch {
      return true;
    }
  },

  async markFirstChatPromptShown() {
    try {
      await EncryptedStorage.setItem(FIRST_CHAT_PROMPT_KEY, 'true');
    } catch {
    }
  },
};
