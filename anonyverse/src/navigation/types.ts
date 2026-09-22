import type { Mood } from '../screens/moodSelect/MoodSelectScreen';
import type { ChatSocketService } from '../services/chatSocket/ChatSocketService';

/**
 * Root navigation param list.
 *
 * Entry, Verification, ChatList, and MoodSelect are registered as real
 * stack routes. Finding a Connection and Chat are intentionally NOT listed
 * here — they render in place inside VerificationRoute/MoodSelectRoute's
 * own step state machine (crossfaded, not pushed) — see RootNavigator.tsx.
 *
 * The Dev* routes are registered only when __DEV__ is true (see
 * RootNavigator.tsx) but stay in this type unconditionally.
 */
export type RootStackParamList = {
  Entry: undefined;
  Verification: undefined;
  ChatList: undefined;
  /**
   * showProgress distinguishes the first-time flow's onboarding-progress
   * variant (Figma node 10:839) from the returning-user variant reached
   * from Chat List's "Start a chat" — same layout, no progress bar.
   */
  MoodSelect: { showProgress: boolean };
  DevMenu: undefined;
  DevTopics: { mood: Mood };
  DevFindingMatch: undefined;
  /** Undefined when reached directly from the Dev Menu (uses a no-op socket instead). */
  DevChat: { service: ChatSocketService; partner: string; mood: Mood; topic: string | null } | undefined;
  DevFindingNewMatchModal: undefined;
};
