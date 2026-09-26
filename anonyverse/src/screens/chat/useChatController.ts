import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler } from 'react-native';
import { useAppForeground } from '../../hooks/useAppForeground';
import type { ChatSocketService } from '../../services/chatSocket/ChatSocketService';
import { findMatch } from '../../services/chatSocket/findMatch';
import type { TokenProvider } from '../../services/session/tokenProvider';
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

/**
 * Why the current rematch started — drives the "finding someone new" modal's subtext.
 * 'reconnecting': our own socket died (backgrounded, network), so the
 * server already ended the chat; we reconnect and rejoin from scratch.
 */
export type RematchReason = 'you_skipped' | 'partner_skipped' | 'partner_ended' | 'reconnecting';

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
  /** Opens the leave confirmation. */
  handleRequestLeave: () => void;
  handleDismissLeaveConfirm: () => void;
  /** Emits `end_chat`, disconnects, and calls onLeave — the actual "Leave chat" action. */
  handleConfirmLeave: () => void;
  handleBack: () => void;
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
const REJOIN_BUSY_MESSAGE = 'Matchmaking is busy — retrying in a moment…';
const REJOIN_GAVE_UP_MESSAGE = "Couldn't find a new match right now. Stop searching and try again later.";

// send_message drops anything over 2000 characters silently.
const MAX_MESSAGE_LENGTH = 2000;
/** Input cap, leaving room for the reply envelope's JSON overhead. */
export const MAX_INPUT_LENGTH = 1500;
const REPLY_PREVIEW_MAX_LENGTH = 200;

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
            text: reply.text.slice(0, REPLY_PREVIEW_MAX_LENGTH),
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
const DISCONNECTED_MESSAGE = 'You were disconnected from the chat.';

/**
 * Owns one Chat session end to end, including what happens after it:
 * rematching after a skip or the partner leaving, and starting over when
 * our own socket dies. The server never resumes a session (docs/api.md
 * "Connection lifecycle rules"), so every recovery is a fresh join_chat
 * with the same `selection`.
 */
export function useChatController(
  chatSocketService: ChatSocketService,
  selection: TopicsSelection,
  tokenProvider: TokenProvider,
  onLeave: () => void,
  onReauthRequired: () => void,
  backHandlerEnabled = true,
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
  // The findMatch loop re-joining the queue, if one is running. Aborted
  // whenever it stops being wanted (a match arrived, a newer re-join
  // started, or the user left), so it can't join while already chatting.
  const rejoinRef = useRef<AbortController | null>(null);
  // Set once the user leaves or the screen unmounts, so nothing reconnects after.
  const leavingRef = useRef(false);
  const latestRef = useRef({ tokenProvider, onReauthRequired });
  latestRef.current = { tokenProvider, onReauthRequired };

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
      leavingRef.current = true;
      rejoinRef.current?.abort();
      serviceRef.current.disconnect();
    };
  }, [chatSocketService]);

  const abortRejoin = useCallback(() => {
    rejoinRef.current?.abort();
    rejoinRef.current = null;
  }, []);

  /**
   * Looks for a new partner via findMatch, which also refreshes the token
   * and reconnects as needed. The match itself arrives as match_found,
   * which the listener below turns into a fresh thread; this only reports
   * a throttled join or matchmaking giving up.
   */
  const rejoin = useCallback(
    async (connectFirst: boolean) => {
      abortRejoin();
      const controller = new AbortController();
      rejoinRef.current = controller;
      setRematchStatusMessage(null);
      setRematchGaveUp(false);

      const result = await findMatch({
        service: serviceRef.current,
        tokenProvider: latestRef.current.tokenProvider,
        selection: selectionRef.current,
        connectFirst,
        signal: controller.signal,
        // Cleared again as each retry goes out.
        onSearching: () => setRematchStatusMessage(null),
        onRateLimited: () => setRematchStatusMessage(REJOIN_BUSY_MESSAGE),
      });
      if (controller.signal.aborted || leavingRef.current) {
        return;
      }
      rejoinRef.current = null;

      if (result.status === 'reauth_required') {
        console.error('[Chat] Session expired and could not be refreshed — sending back to Entry.');
        leavingRef.current = true;
        serviceRef.current.disconnect();
        latestRef.current.onReauthRequired();
      } else if (result.status === 'failed') {
        console.error('[Chat] Could not find a new match.', result.reason);
        setRematchStatusMessage(REJOIN_GAVE_UP_MESSAGE);
        setRematchGaveUp(true);
      }
    },
    [abortRejoin],
  );

  /**
   * Our own connection is gone (or may be: the app was backgrounded), so
   * the server has already ended this chat and forgotten us. Reset and
   * start over on a fresh socket.
   */
  const resume = useCallback(() => {
    if (leavingRef.current) {
      return;
    }
    abortRejoin();
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    isTypingRef.current = false;
    setPartnerTyping(false);
    setShowLeaveConfirm(false);
    setReplyingTo(null);
    setMessages([{ id: nextMessageId(), sender: 'system', text: DISCONNECTED_MESSAGE }]);
    setRematchReason('reconnecting');
    setRematchState('rematching');
    serviceRef.current.disconnect();
    rejoin(true);
  }, [abortRejoin, rejoin]);

  useAppForeground(resume);

  useEffect(() => {
    // A skip is driven entirely by these two server events rather than the
    // button tap itself, so the "finding someone new" state appears the
    // same way for both people in the chat — whichever of them tapped Skip.
    const unsubscribeChatEnded = chatSocketService.onChatEnded(event => {
      // Whatever was open, there's no partner left to save or leave.
      setShowLeaveConfirm(false);
      if (event.reason === 'skipped') {
        // The server requeues both sides after a skip, and match_found or
        // queued follows on its own. Don't join_chat here: it would only
        // spend the join_chat rate limit.
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
        // The server does NOT requeue us here, so rejoin with the same selection.
        setRematchReason('partner_ended');
        setRematchState('rematching');
        rejoin(false);
      }
    });
    const unsubscribeMatchFound = chatSocketService.onMatchFound(() => {
      abortRejoin();
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
      if (event.reason === 'not_in_chat') {
        // The server thinks we're not chatting but the UI does: we missed
        // a disconnect. Only meaningful while the UI shows a live chat.
        if (rematchStateRef.current === 'idle') {
          resume();
        }
        return;
      }
      // While rematching the toast would sit hidden under the modal, which
      // already reports a throttled re-join through its own status line.
      if (event.reason === 'rate_limited' && rematchStateRef.current !== 'rematching') {
        showToast(RATE_LIMITED_MESSAGE);
      }
    });

    const unsubscribeConnectionLost = chatSocketService.onConnectionLost(() => {
      // A running findMatch loop recovers from drops itself.
      if (rejoinRef.current) {
        return;
      }
      // Reconnecting from the background would just be killed again; the
      // foreground listener resumes once the app is back.
      if (AppState.currentState === 'active') {
        resume();
      }
    });

    return () => {
      unsubscribeChatEnded();
      unsubscribeMatchFound();
      unsubscribeServerError();
      unsubscribeConnectionLost();
      abortRejoin();
    };
  }, [chatSocketService, showToast, rejoin, resume, abortRejoin]);

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
    const envelope = reply
      ? JSON.stringify({ text, replyTo: { ...reply, text: reply.text.slice(0, REPLY_PREVIEW_MAX_LENGTH) } })
      : null;
    // Fall back to plain text rather than let the server silently drop an
    // over-long envelope. The local bubble drops its reply too, so it shows
    // what the partner actually receives.
    const sendEnvelope = envelope !== null && envelope.length <= MAX_MESSAGE_LENGTH;
    serviceRef.current.sendMessage(sendEnvelope ? envelope : text);
    setMessages(current => [
      ...current,
      { id: nextMessageId(), sender: 'me', text, replyTo: sendEnvelope && reply ? reply : undefined },
    ]);
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
    leavingRef.current = true;
    abortRejoin();
    serviceRef.current.disconnect();
    onLeave();
  }, [abortRejoin, onLeave]);

  const handleRequestLeave = useCallback(() => {
    setShowLeaveConfirm(true);
  }, []);

  const handleDismissLeaveConfirm = useCallback(() => {
    setShowLeaveConfirm(false);
  }, []);

  const handleConfirmLeave = useCallback(() => {
    setShowLeaveConfirm(false);
    leavingRef.current = true;
    abortRejoin();
    serviceRef.current.sendEndChat();
    serviceRef.current.disconnect();
    onLeave();
  }, [abortRejoin, onLeave]);

  const handleBack = useCallback(() => {
    if (rematchState === 'rematching') {
      // Same exit as the "Stop searching" button — no partner to save,
      // so back just leaves the same way that button already does.
      handleStopSearching();
      return;
    }
    if (showLeaveConfirm) {
      // Back dismisses the confirmation instead of doing nothing, so the
      // user is never stuck with no way to cancel out of the popup.
      setShowLeaveConfirm(false);
      return;
    }
    setShowLeaveConfirm(true);
  }, [rematchState, showLeaveConfirm, handleStopSearching]);

  useEffect(() => {
    if (!backHandlerEnabled) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });

    return () => subscription.remove();
  }, [backHandlerEnabled, handleBack]);

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
    showLeaveConfirm,
    handleRequestLeave,
    handleDismissLeaveConfirm,
    handleConfirmLeave,
    handleBack,
  };
}
