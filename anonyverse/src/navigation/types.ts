/**
 * Root navigation param list.
 *
 * Only "Entry" is registered today. Verification and Chat List are not
 * implemented yet (out of scope for this task — see docs/flow.md), so
 * they are intentionally NOT listed here; adding a route key without a
 * matching screen would let code reference navigation targets that don't
 * exist. Add them here, and register real <Stack.Screen> entries for
 * them, when those screens are built.
 */
export type RootStackParamList = {
  Entry: undefined;
};
