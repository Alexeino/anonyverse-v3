import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import type { ChatSocketService } from '../../services/chatSocket/ChatSocketService';
import type { TopicsSelection } from '../topics/TopicsScreen';

export interface ReplyPreview {
  id: string;
  sender: 'me' | 'partner';
  text: string;
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'partner' | 'system';
  text: string;
  replyTo?: ReplyPreview;
}

export type RematchState = 'idle' | 'rematching';

/** Why the current rematch started — drives the "finding someone new" modal's subtext. */
export type RematchReason = 'you_skipped' | 'partner_skipped' | 'partner_ended';

export interface UseChatControllerResult {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (value: string) => void;
  introDismissed: boolean;
  handleDismissIntro: () => void;
  handleSend: () => void;
  skipSecondsRemaining: number;
  canSkip: boolean;
  partnerTyping: boolean;
  replyingTo: ReplyPreview | null;
  handleReply: (message: ChatMessage) => void;
  handleCancelReply: () => void;
  rematchState: RematchState;
  rematchReason: RematchReason | null;
  skipUnavailableMessage: string | null;
  handleSkip: () => void;
  handleStopSearching: () => void;
  /** Shown inside the "finding someone new" modal when re-joining the queue is throttled or fails. */
  rematchStatusMessage: string | null;
  /** True once re-joining has given up — only then is the status an error. */
  rematchGaveUp: boolean;
  /** Whether the "you can't leave mid-chat" confirmation is showing. */
  showLeaveConfirm: boolean;
  /** The socket dropped mid-chat; the screen should tell the user and leave via handleStopSearching. */
  connectionLost: boolean;
  /** Opens the leave confirmation — the header's leave button (iOS has no hardware back). */
  handleRequestLeave: () => void;
  handleDismissLeaveConfirm: () => void;
  /** Emits `end_chat`, disconnects, and calls onLeave — the actual "Leave chat" action. */
  handleConfirmLeave: () => void;
}

const SKIP_UNLOCK_SECONDS = 10;

const TYPING_STOP_DELAY_MS = 4000;

// Mirrors the backend's skip_chat token bucket (WS_SKIP_CHAT_LIMIT=3,
// WS_SKIP_CHAT_REFILL_RATE=0.033/s) so a skip the server would throttle
// shows "Matchmaking unavailable" instead of being sent and silently dropped.
// The server bucket is per device and outlives this screen, so a server
// `rate_limited` error is still handled as the fallback.
const SKIP_BUCKET_SIZE = 3;
const SKIP_REFILL_PER_MS = 0.033 / 1000;
const SKIP_UNAVAILABLE_MESSAGE_MS = 3000;
const SKIP_UNAVAILABLE_MESSAGE = 'Matchmaking unavailable — try again in a moment';
const RATE_LIMITED_MESSAGE = "You're going a bit fast — try again in a moment";

// join_chat refills one token every ~15s (WS_JOIN_CHAT_REFILL_RATE=0.067/s).
const REJOIN_RETRY_DELAY_MS = 15_000;
const REJOIN_MAX_ATTEMPTS = 3;

let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter += 1;
  return `msg-${messageIdCounter}`;
}

/**
 * Parses an incoming `receive_message` payload per docs/api.md's client-side
 * convention: either a plain string, or a JSON-encoded
 * `{text, replyTo: {id, sender, text}}` envelope. `replyTo.sender` is
 * flipped ('me' <-> 'partner') because it was recorded from the *other*
 * client's perspective.
 */
function parseIncomingMessage(raw: string): { text: string; replyTo?: ReplyPreview } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { text?: unknown }).text === 'string') {
      const { text, replyTo } = parsed as { text: string; replyTo?: unknown };
      if (
        replyTo &&
        typeof replyTo === 'object' &&
        typeof (replyTo as { text?: unknown }).text === 'string' &&
        ((replyTo as { sender?: unknown }).sender === 'me' || (replyTo as { sender?: unknown }).sender === 'partner')
      ) {
        const reply = replyTo as ReplyPreview;
        return {
          text,
          replyTo: {
            id: reply.id ?? '',
            sender: reply.sender === 'me' ? 'partner' : 'me',
            text: reply.text,
          },
        };
      }
      return { text };
    }
  } catch {
    // Not JSON — treat as plain text, per docs/api.md's opaque-string contract.
  }
  return { text: raw };
}


const CONNECTED_MESSAGE = "Connected with anonymous partner. Say Hi!";

export function useChatController(
  chatSocketService: ChatSocketService,
  selection: TopicsSelection,
  onLeave: () => void,
): UseChatControllerResult {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: nextMessageId(), sender: 'system', text: CONNECTED_MESSAGE },
  ]);
  const [inputValue, setInputValueState] = useState('');
  const [introDismissed, setIntroDismissed] = useState(false);
  const [skipSecondsRemaining, setSkipSecondsRemaining] = useState(SKIP_UNLOCK_SECONDS);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null);
  const [rematchState, setRematchState] = useState<RematchState>('idle');
  const [rematchReason, setRematchReason] = useState<RematchReason | null>(null);
  const [skipUnavailableMessage, setSkipUnavailableMessage] = useState<string | null>(null);
  const [rematchStatusMessage, setRematchStatusMessage] = useState<string | null>(null);
  const [rematchGaveUp, setRematchGaveUp] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const serviceRef = useRef(chatSocketService);
  serviceRef.current = chatSocketService;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const rematchStateRef = useRef(rematchState);
  rematchStateRef.current = rematchState;
  const isTypingRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipBucketRef = useRef({ tokens: SKIP_BUCKET_SIZE, lastRefill: Date.now() });
  const skipUnavailableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rejoinRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped whenever an in-flight re-join stops being wanted (a match arrived,
  // a newer re-join started, or the screen unmounted), so a late join_chat
  // ack/timeout can't schedule another join while the user is already chatting.
  const rejoinGenerationRef = useRef(0);

  const showToast = useCallback((message: string) => {
    if (skipUnavailableTimerRef.current) {
      clearTimeout(skipUnavailableTimerRef.current);
    }
    setSkipUnavailableMessage(message);
    skipUnavailableTimerRef.current = setTimeout(() => setSkipUnavailableMessage(null), SKIP_UNAVAILABLE_MESSAGE_MS);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setSkipSecondsRemaining(current => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = chatSocketService.onReceiveMessage(event => {
      const { text, replyTo } = parseIncomingMessage(event.message);
      setMessages(current => [...current, { id: nextMessageId(), sender: 'partner', text, replyTo }]);
    });

    return () => {
      unsubscribe();
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
      }
      if (skipUnavailableTimerRef.current) {
        clearTimeout(skipUnavailableTimerRef.current);
      }
      serviceRef.current.disconnect();
    };
  }, [chatSocketService]);

  useEffect(() => {
    // A skip is driven entirely by these two server events rather than the
    // button tap itself, so the "finding someone new" state appears the
    // same way for both people in the chat — whichever of them tapped Skip.
    const clearRejoinRetry = () => {
      rejoinGenerationRef.current += 1;
      if (rejoinRetryTimerRef.current) {
        clearTimeout(rejoinRetryTimerRef.current);
        rejoinRetryTimerRef.current = null;
      }
    };

    // join_chat can be throttled (ack `{ ok: false, status: 'rate_limited' }`)
    // or time out — retry a few times rather than leaving the user on
    // "Finding you someone new" forever, then tell them it gave up.
    const rejoinQueue = (attempt: number) => {
      const current = selectionRef.current;
      const generation = rejoinGenerationRef.current;
      const isStale = () => generation !== rejoinGenerationRef.current;
      const retryOrGiveUp = () => {
        if (isStale()) {
          return;
        }
        if (attempt >= REJOIN_MAX_ATTEMPTS) {
          setRematchStatusMessage("Couldn't find a new match right now. Stop searching and try again later.");
          setRematchGaveUp(true);
          return;
        }
        setRematchStatusMessage('Matchmaking is busy — retrying in a moment…');
        rejoinRetryTimerRef.current = setTimeout(() => rejoinQueue(attempt + 1), REJOIN_RETRY_DELAY_MS);
      };
      serviceRef.current.joinChat(current.tags, current.mood, current.optedIn).then(
        ack => {
          if (isStale()) {
            return;
          }
          if (ack.ok) {
            setRematchStatusMessage(null);
            return;
          }
          retryOrGiveUp();
        },
        error => {
          console.error('[Chat] Failed to re-join the queue after the partner left.', error);
          retryOrGiveUp();
        },
      );
    };

    const unsubscribeChatEnded = chatSocketService.onChatEnded(event => {
      // Whatever was open, there's no partner left to save or leave.
      setShowLeaveConfirm(false);
      if (event.reason === 'skipped') {
        setRematchReason(event.by === 'self' ? 'you_skipped' : 'partner_skipped');
        setRematchState('rematching');
        return;
      }
      // 'ended'/'disconnected' with by:'self' is this same client leaving
      // (see handleConfirmLeave) — it's already exiting via onLeave, so
      // there's nothing further to do here. Only the *other* side re-joins.
      if ((event.reason === 'ended' || event.reason === 'disconnected') && event.by === 'partner') {
        // A partner closing the app ('disconnected') reads the same to this
        // user as them ending the chat.
        setRematchReason('partner_ended');
        setRematchState('rematching');
        clearRejoinRetry();
        setRematchGaveUp(false);
        rejoinQueue(1);
      }
    });
    const unsubscribeMatchFound = chatSocketService.onMatchFound(() => {
      clearRejoinRetry();
      setRematchState('idle');
      setRematchReason(null);
      setRematchStatusMessage(null);
      setRematchGaveUp(false);
      setShowLeaveConfirm(false);
      setMessages([{ id: nextMessageId(), sender: 'system', text: CONNECTED_MESSAGE }]);
      setReplyingTo(null);
      setSkipSecondsRemaining(SKIP_UNLOCK_SECONDS);
    });
    // The backend reports throttled events only through `error`, so without
    // this a rate-limited skip (or message) would silently do nothing.
    const unsubscribeServerError = chatSocketService.onServerError(event => {
      // While rematching the toast would sit hidden under the modal, which
      // already reports a throttled re-join through its own status line.
      if (event.reason === 'rate_limited' && rematchStateRef.current !== 'rematching') {
        showToast(RATE_LIMITED_MESSAGE);
      }
    });

    const unsubscribeConnectionLost = chatSocketService.onConnectionLost(() => {
      clearRejoinRetry();
      setShowLeaveConfirm(false);
      setConnectionLost(true);
    });

    return () => {
      unsubscribeChatEnded();
      unsubscribeMatchFound();
      unsubscribeServerError();
      unsubscribeConnectionLost();
      clearRejoinRetry();
    };
  }, [chatSocketService, showToast]);

  useEffect(() => {
    const clearPartnerTypingTimeout = () => {
      if (partnerTypingTimeoutRef.current) {
        clearTimeout(partnerTypingTimeoutRef.current);
        partnerTypingTimeoutRef.current = null;
      }
    };

    const unsubscribeTyping = chatSocketService.onPartnerTyping(() => {
      setPartnerTyping(true);
      clearPartnerTypingTimeout();
      partnerTypingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), TYPING_STOP_DELAY_MS);
    });
    const unsubscribeTypingStop = chatSocketService.onPartnerTypingStop(() => {
      clearPartnerTypingTimeout();
      setPartnerTyping(false);
    });

    return () => {
      unsubscribeTyping();
      unsubscribeTypingStop();
      clearPartnerTypingTimeout();
    };
  }, [chatSocketService]);

  const stopTyping = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      serviceRef.current.sendTypingStop();
    }
  }, []);

  const setInputValue = useCallback(
    (value: string) => {
      setInputValueState(value);

      if (!value.trim()) {
        stopTyping();
        return;
      }
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        serviceRef.current.sendTyping();
      }
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
      }
      typingStopTimerRef.current = setTimeout(stopTyping, TYPING_STOP_DELAY_MS);
    },
    [stopTyping],
  );

  const handleDismissIntro = useCallback(() => {
    setIntroDismissed(true);
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) {
      return;
    }
    stopTyping();
    const reply = replyingTo;
    const payload = reply ? JSON.stringify({ text, replyTo: reply }) : text;
    serviceRef.current.sendMessage(payload);
    setMessages(current => [...current, { id: nextMessageId(), sender: 'me', text, replyTo: reply ?? undefined }]);
    setInputValueState('');
    setReplyingTo(null);
  }, [inputValue, replyingTo, stopTyping]);

  const handleReply = useCallback((message: ChatMessage) => {
    if (message.sender === 'system') {
      return;
    }
    setReplyingTo({ id: message.id, sender: message.sender, text: message.text });
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleSkip = useCallback(() => {
    if (skipSecondsRemaining > 0) {
      return;
    }
    const now = Date.now();
    const bucket = skipBucketRef.current;
    bucket.tokens = Math.min(SKIP_BUCKET_SIZE, bucket.tokens + (now - bucket.lastRefill) * SKIP_REFILL_PER_MS);
    bucket.lastRefill = now;
    if (bucket.tokens < 1) {
      showToast(SKIP_UNAVAILABLE_MESSAGE);
      return;
    }
    bucket.tokens -= 1;
    serviceRef.current.sendSkipChat();
  }, [skipSecondsRemaining, showToast]);

  const handleStopSearching = useCallback(() => {
    serviceRef.current.disconnect();
    onLeave();
  }, [onLeave]);

  const handleRequestLeave = useCallback(() => {
    setShowLeaveConfirm(true);
  }, []);

  const handleDismissLeaveConfirm = useCallback(() => {
    setShowLeaveConfirm(false);
  }, []);

  const handleConfirmLeave = useCallback(() => {
    setShowLeaveConfirm(false);
    serviceRef.current.sendEndChat();
    serviceRef.current.disconnect();
    onLeave();
  }, [onLeave]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (rematchState === 'rematching' || connectionLost) {
        // Same exit as the "Stop searching" button — no partner to save,
        // so back just leaves the same way that button already does.
        handleStopSearching();
        return true;
      }
      if (showLeaveConfirm) {
        // Back dismisses the confirmation instead of doing nothing, so the
        // user is never stuck with no way to cancel out of the popup.
        setShowLeaveConfirm(false);
        return true;
      }
      setShowLeaveConfirm(true);
      return true;
    });

    return () => subscription.remove();
  }, [rematchState, showLeaveConfirm, connectionLost, handleStopSearching]);

  return {
    messages,
    inputValue,
    setInputValue,
    introDismissed,
    handleDismissIntro,
    handleSend,
    skipSecondsRemaining,
    canSkip: skipSecondsRemaining <= 0,
    partnerTyping,
    replyingTo,
    handleReply,
    handleCancelReply,
    rematchState,
    rematchReason,
    skipUnavailableMessage,
    handleSkip,
    handleStopSearching,
    rematchStatusMessage,
    rematchGaveUp,
    connectionLost,
    showLeaveConfirm,
    handleRequestLeave,
    handleDismissLeaveConfirm,
    handleConfirmLeave,
  };
}
