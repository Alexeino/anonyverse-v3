import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatSocketService } from '../../services/chatSocket/ChatSocketService';
import type { ChatSocketConnectError, ChatSocketConnectErrorReason } from '../../services/chatSocket/types';
import type { SessionStore } from '../../services/session/SessionStore';
import type { TopicsSelection } from '../topics/TopicsScreen';

export type FindingMatchPhase = 'connecting' | 'searching' | 'matched' | 'error';

export interface UseFindingMatchControllerResult {
  phase: FindingMatchPhase;
  /** Populated only while phase is 'error'. */
  error: { reason: ChatSocketConnectErrorReason } | null;
  /** Tap handler for the close (X) button — cancels the search. */
  handleClose: () => void;
}

/** How long the "Match found!" state is shown before handing off to the Chat screen. */
const MATCH_HANDOFF_DELAY_MS = 1200;

/**
 * Owns the Finding Match screen's state machine: connects to the
 * matchmaking socket (docs/api.md §3) using the session's stored access
 * token, emits join_chat with the caller's topic selection, and waits for
 * match_found — the only signal treated as authoritative here, since the
 * server also acks join_chat directly with {ok, status}, but that ack is
 * informational only (see ChatSocketService).
 *
 * On match_found, shows the 'matched' state briefly and then calls
 * `onMatched` with the still-connected ChatSocketService and the partner
 * id, so the caller can hand the live socket straight to the Chat screen
 * instead of this hook disconnecting it — see the handedOffRef guard below.
 *
 * There's no dedicated "leave queue" event (docs/api.md, Not Yet
 * Implemented) — disconnecting the socket, via handleClose or unmount, is
 * the only way to stop searching today.
 */
export function useFindingMatchController(
  selection: TopicsSelection,
  sessionStore: SessionStore,
  // TODO: document/enforce that this must be a stable reference (module-level,
  // useCallback, or useMemo) — an inline factory would re-run the connect →
  // join_chat effect on every render. See useEffect dep array below. The
  // same applies to onMatched.
  createChatSocketService: () => ChatSocketService,
  onClose: () => void,
  onMatched: (service: ChatSocketService, partner: string) => void,
): UseFindingMatchControllerResult {
  const [phase, setPhase] = useState<FindingMatchPhase>('connecting');
  const [error, setError] = useState<{ reason: ChatSocketConnectErrorReason } | null>(null);
  const serviceRef = useRef<ChatSocketService | null>(null);
  // Set just before onMatched fires, so the effect's cleanup (which runs on
  // unmount once the caller swaps this screen out for Chat) knows not to
  // disconnect a socket it just handed off live.
  const handedOffRef = useRef(false);

  useEffect(() => {
    const token = sessionStore.getToken();

    if (!token) {
      console.error('[FindingMatch] No access token available — cannot connect.');
      setError({ reason: 'MISSING_TOKEN' });
      setPhase('error');
      return;
    }

    let cancelled = false;
    const service = createChatSocketService();
    serviceRef.current = service;

    const unsubscribeMatchFound = service.onMatchFound(event => {
      if (cancelled) {
        return;
      }
      if (__DEV__) {
        console.log('[FindingMatch] Match found — handing off to chat screen.', event.partner);
      }
      setPhase('matched');
      setTimeout(() => {
        if (cancelled) {
          return;
        }
        handedOffRef.current = true;
        onMatched(service, event.partner);
      }, MATCH_HANDOFF_DELAY_MS);
    });

    (async () => {
      try {
        await service.connect(token.access_token, selection.tags[0] ?? null);
        if (cancelled) {
          return;
        }
        setPhase('searching');

        const ack = await service.joinChat(selection.tags, selection.mood, selection.optedIn);
        if (cancelled) {
          return;
        }
        if (__DEV__) {
          console.log('[FindingMatch] join_chat acknowledged.', ack);
        }
      } catch (thrown) {
        if (cancelled) {
          return;
        }
        const connectError = thrown as ChatSocketConnectError;
        const reason = connectError.reason ?? 'UNKNOWN_ERROR';
        // `connectError.raw` may carry the underlying socket.io-client
        // error/stack — kept out of production logs (e.g. a crash
        // reporter) since it's only useful for local debugging.
        console.error('[FindingMatch] Failed to connect.', reason);
        if (__DEV__) {
          console.error('[FindingMatch] Raw connect error:', connectError.raw);
        }
        setError({ reason });
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeMatchFound();
      if (!handedOffRef.current) {
        service.disconnect();
      }
    };
  }, [selection, sessionStore, createChatSocketService, onMatched]);

  const handleClose = useCallback(() => {
    serviceRef.current?.disconnect();
    onClose();
  }, [onClose]);

  return { phase, error, handleClose };
}
