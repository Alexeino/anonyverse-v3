import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatSocketService } from '../../services/chatSocket/ChatSocketService';
import { findMatch } from '../../services/chatSocket/findMatch';
import type { ChatSocketConnectErrorReason } from '../../services/chatSocket/types';
import type { TokenProvider } from '../../services/session/tokenProvider';
import type { TopicsSelection } from '../topics/TopicsScreen';
import { useAppForeground } from '../../hooks/useAppForeground';
import { useAnalyticsCapture, useDurationTracking } from '../../hooks/usePosthogHooks';

export type FindingMatchPhase = 'connecting' | 'searching' | 'matched' | 'error';

export interface UseFindingMatchControllerResult {
  phase: FindingMatchPhase;

  error: { reason: ChatSocketConnectErrorReason } | null;

  handleClose: () => void;
}

const MATCH_HANDOFF_DELAY_MS = 1200;


export function useFindingMatchController(
  selection: TopicsSelection,
  tokenProvider: TokenProvider,
  createChatSocketService: () => ChatSocketService,
  onClose: () => void,
  onMatched: (service: ChatSocketService, partner: string) => void,
  onReauthRequired: () => void,
): UseFindingMatchControllerResult {
  const [phase, setPhase] = useState<FindingMatchPhase>('connecting');
  const [error, setError] = useState<{ reason: ChatSocketConnectErrorReason } | null>(null);
  // Bumped to tear the search down and start over on a fresh socket (the
  // app came back from the background, where the OS killed the socket).
  const [searchAttempt, setSearchAttempt] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const serviceRef = useRef<ChatSocketService | null>(null);
  // The findMatch loop currently running, so handleClose can stop it.
  const searchRef = useRef<AbortController | null>(null);
  const captureAnalytics = useAnalyticsCapture();
  const { start, captureEnd } = useDurationTracking();
  // Kept fresh every render so the socket effect below can call the latest
  // captureEnd without listing it in its dep array — captureEnd is derived
  // from the PostHog client instance, and including it directly would
  // re-run (and reconnect) the socket effect if that instance's identity
  // ever changed.
  const captureEndRef = useRef(captureEnd);
  captureEndRef.current = captureEnd;
  const onReauthRequiredRef = useRef(onReauthRequired);
  onReauthRequiredRef.current = onReauthRequired;
  // Set just before onMatched fires, so the effect's cleanup (which runs on
  // unmount once the caller swaps this screen out for Chat) knows not to
  // disconnect a socket it just handed off live.
  const handedOffRef = useRef(false);
  // Set by handleClose. The unmount that sets the effect's own `cancelled`
  // lags the tap by the parent's crossfade, and a pending handoff must not
  // fire in that gap with the socket handleClose just closed.
  const closedRef = useRef(false);

  // Mount-once, independent of the connect/join_chat effect below (whose
  // deps aren't a strict mount-once guarantee) — mirrors the
  // verification_started pattern of firing regardless of what happens
  // afterward.
  useEffect(() => {
    start();
    captureAnalytics('match_search_started', { topics: selection.tags });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    let handoffTimer: ReturnType<typeof setTimeout> | null = null;
    const service = createChatSocketService();
    serviceRef.current = service;
    setPhase('connecting');
    setError(null);

    function cancelHandoff() {
      if (handoffTimer) {
        clearTimeout(handoffTimer);
        handoffTimer = null;
      }
    }

    async function search(connectFirst: boolean) {
      // A new search supersedes any earlier loop that's still unwinding.
      searchRef.current?.abort();
      const controller = new AbortController();
      searchRef.current = controller;

      const result = await findMatch({
        service,
        tokenProvider,
        selection,
        connectFirst,
        signal: controller.signal,
        onSearching: () => setPhase('searching'),
      });
      if (controller.signal.aborted || cancelled || closedRef.current) {
        return;
      }

      switch (result.status) {
        case 'matched': {
          if (__DEV__) {
            console.log('[FindingMatch] Match found — handing off to chat screen.', result.partner);
          }
          captureEndRef.current('match_found', 'wait_duration_ms', { topics: selection.tags });
          setPhase('matched');
          handoffTimer = setTimeout(() => {
            handoffTimer = null;
            if (cancelled || closedRef.current) {
              return;
            }
            handedOffRef.current = true;
            onMatched(service, result.partner);
          }, MATCH_HANDOFF_DELAY_MS);
          return;
        }
        case 'reauth_required':
          console.error('[FindingMatch] Session expired and could not be refreshed — sending back to Entry.');
          service.disconnect();
          onReauthRequiredRef.current();
          return;
        case 'failed':
          console.error('[FindingMatch] Failed to find a match.', result.reason);
          service.disconnect();
          setError({ reason: result.reason });
          setPhase('error');
          return;
        case 'cancelled':
          return;
      }
    }

    // Matched with someone who had just left (docs/api.md "Matched with
    // someone who just left"): chat_ended arrives right after match_found.
    // Don't hand off a dead chat — go back to searching.
    const unsubscribeChatEnded = service.onChatEnded(event => {
      if (cancelled || !handoffTimer || event.by !== 'partner') {
        return;
      }
      cancelHandoff();
      setPhase('searching');
      search(false);
    });
    // While findMatch runs it recovers from drops itself; this covers the
    // handoff delay, where nothing else is watching the socket.
    const unsubscribeConnectionLost = service.onConnectionLost(() => {
      if (cancelled || !handoffTimer) {
        return;
      }
      cancelHandoff();
      setPhase('connecting');
      search(true);
    });

    search(true);

    return () => {
      cancelled = true;
      searchRef.current?.abort();
      cancelHandoff();
      unsubscribeChatEnded();
      unsubscribeConnectionLost();
      if (!handedOffRef.current) {
        service.disconnect();
      }
    };
  }, [selection, tokenProvider, createChatSocketService, onMatched, searchAttempt]);

  useAppForeground(() => {
    if (phaseRef.current !== 'error' && !handedOffRef.current && !closedRef.current) {
      setSearchAttempt(attempt => attempt + 1);
    }
  });

  const handleClose = useCallback(() => {
    closedRef.current = true;
    searchRef.current?.abort();
    const service = serviceRef.current;
    if (service) {
      // Cancels the search server-side; the disconnect right after is
      // flushed behind it on the same socket.
      service.sendEndChat();
      service.disconnect();
    }
    onClose();
  }, [onClose]);

  return { phase, error, handleClose };
}
