/**
 * Root navigation param list.
 *
 * Entry, Verification, ChatList, and MoodSelect are registered. Finding a
 * Connection (and everything past it) is not implemented yet (out of scope
 * for this task — see docs/flow.md), so it is intentionally NOT listed
 * here; adding a route key without a matching screen would let code
 * reference navigation targets that don't exist. Add it here, and register
 * a real <Stack.Screen> for it, when that screen is built.
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
};
