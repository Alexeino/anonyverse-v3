import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Calls `onForeground` whenever the app comes back from the background.
 *
 * The OS closes the socket whenever the app is backgrounded, and the
 * server ends the chat/search right away and keeps nothing (docs/api.md
 * "Connection lifecycle rules") — so on return the client has to reset
 * and start over, whether or not the socket visibly dropped. iOS's
 * transient 'inactive' state (Control Center, the app switcher peek)
 * doesn't close the socket, so only background -> active counts.
 */
export function useAppForeground(onForeground: () => void): void {
  const onForegroundRef = useRef(onForeground);
  onForegroundRef.current = onForeground;

  useEffect(() => {
    let wasBackgrounded = AppState.currentState === 'background';
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        wasBackgrounded = true;
        return;
      }
      if (next === 'active' && wasBackgrounded) {
        wasBackgrounded = false;
        onForegroundRef.current();
      }
    });
    return () => subscription.remove();
  }, []);
}
