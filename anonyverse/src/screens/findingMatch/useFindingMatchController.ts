import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatSocketService } from '../../services/chatSocket/ChatSocketService';
import type { ChatSocketConnectError, ChatSocketConnectErrorReason } from '../../services/chatSocket/types';
import type { SessionStore } from '../../services/session/SessionStore';
import type { TopicsSelection } from '../topics/TopicsScreen';

export type FindingMatchPhase = 'connecting' | 'searching' | 'matched' | 'error';

export interface UseFindingMatchControllerResult {
  phase: FindingMatchPhase;
  
  error: { reason: ChatSocketConnectErrorReason } | null;

  handleClose: () => void;
}

const MATCH_HANDOFF_DELAY_MS = 1200;


export function useFindingMatchController(
  selection: TopicsSelection,
  sessionStore: SessionStore,
  createChatSocketService: () => ChatSocketService,
  onClose: () => void,
  onMatched: (service: ChatSocketService, partner: string) => void,
): UseFindingMatchControllerResult {
  const [phase, setPhase] = useState<FindingMatchPhase>('connecting');
  const [error, setError] = useState<{ reason: ChatSocketConnectErrorReason } | null>(null);
  const serviceRef = useRef<ChatSocketService | null>(null);

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
