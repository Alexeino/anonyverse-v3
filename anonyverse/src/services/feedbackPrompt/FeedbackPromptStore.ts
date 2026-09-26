export interface FeedbackPromptStore {
  hasShownFirstChatPrompt(): Promise<boolean>;
  markFirstChatPromptShown(): Promise<void>;
}
