import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler } from 'react-native';
import { useAppForeground } from '../../hooks/useAppForeground';
import type { ChatSocketService } from '../../services/chatSocket/ChatSocketService';
import { findMatch } from '../../services/chatSocket/findMatch';
import type { ReportService } from '../../services/report/ReportService';
import type { ReportOutcome, ReportType } from '../../services/report/types';
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
export interface ReportSnackbar {
  text: string;
  tone: 'success' | 'error';
}

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
  /** Opens the leave confirmation — the header's leave button (iOS has no hardware back). */
  handleRequestLeave: () => void;
  handleDismissLeaveConfirm: () => void;
  /** Emits `end_chat`, disconnects, and calls onLeave — the actual "Leave chat" action. */
  handleConfirmLeave: () => void;
  /** Whether the "Report this person" sheet is showing. */
  showReportSheet: boolean;
  /** True while a report request (including its retries) is in flight. */
  reportSubmitting: boolean;
  /** Transient snackbar with the report's outcome — shown over the rematch modal. */
  reportSnackbar: ReportSnackbar | null;
  /** Opens the report sheet — only during a live chat. */
  handleOpenReport: () => void;
  /** Closes the report sheet; ignored while a report is being sent. */
  handleDismissReport: () => void;
  /**
   * Sends the report, then — whatever its outcome — ends the chat and looks
   * for a new match. The server works out who is reported from our chat
   * state, so ending the chat must wait for the report.
   */
  handleSubmitReport: (reportType: ReportType, description?: string) => void;
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

// A report that failed on a 5xx or the network is retried after each of
// these delays. A report that returned 200 is never retried: the server
// doesn't deduplicate, so a retry would file a second report.
const REPORT_RETRY_DELAYS_MS = [1000, 2000];
const REPORT_SNACKBAR_MS = 4000;
const REPORT_SUCCESS_MESSAGE = 'Reported successfully. Thanks, this helps us keep Anonyverse safe.';
const REPORT_CHAT_ENDED_MESSAGE = "That chat had already ended, so the report couldn't be sent.";
const REPORT_FAILED_MESSAGE = "Couldn't send the report, but you've left that chat.";
// After a report we end the chat ourselves (skip_chat is too tightly rate
// limited) and wait for the server's chat_ended before re-joining, so the
// join can't be processed while we're still paired. If it doesn't come —
// end_chat throttled or lost — closing our socket ends the chat instead.
const END_CHAT_CONFIRM_TIMEOUT_MS = 3000;

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

type SubmitReportResult = ReportOutcome | { status: 'reauth_required' } | { status: 'offline' };

/**
 * Sends one report, refreshing the token once on a 401 and retrying
 * 5xx/network failures with backoff. Resolves null once `isStale` says the
 * result is no longer wanted (the chat ended or the user left meanwhile).
 */
async function submitReportWithRetries({
  reportService,
  tokenProvider,
  getSocketId,
  reportType,
  description,
  isStale,
}: {
  reportService: ReportService;
  tokenProvider: TokenProvider;
  getSocketId: () => string | null;
  reportType: ReportType;
  description?: string;
  isStale: () => boolean;
}): Promise<SubmitReportResult | null> {
  let forceRefresh = false;
  let retriedUnauthorized = false;
  let retries = 0;

  for (;;) {
    const tokenResult = await tokenProvider.getFreshAccessToken(forceRefresh ? { forceRefresh: true } : undefined);
    if (isStale()) {
      return null;
    }
    if (tokenResult.status === 'reauth_required') {
      return tokenResult;
    }

    let outcome: ReportOutcome;
    if (tokenResult.status === 'failed') {
      outcome = { status: 'failed', retryable: true, error: tokenResult.error };
    } else {
      // Read right before sending: a stale sid is rejected with 403.
      const reportingUserSid = getSocketId();
      if (!reportingUserSid) {
        return { status: 'offline' };
      }
      outcome = await reportService.reportUser({
        accessToken: tokenResult.accessToken,
        reportType,
        description,
        reportingUserSid,
      });
      if (isStale()) {
        return null;
      }
    }

    if (outcome.status === 'unauthorized' && !retriedUnauthorized) {
      retriedUnauthorized = true;
      forceRefresh = true;
      continue;
    }
    if (outcome.status === 'failed' && outcome.retryable && retries < REPORT_RETRY_DELAYS_MS.length) {
      await new Promise<void>(resolve => setTimeout(resolve, REPORT_RETRY_DELAYS_MS[retries]));
      retries += 1;
      forceRefresh = false;
      if (isStale()) {
        return null;
      }
      continue;
    }
    return outcome;
  }
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
  reportService: ReportService,
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
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSnackbar, setReportSnackbar] = useState<ReportSnackbar | null>(null);
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
  const reportSnackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set while we wait for chat_ended after ending a reported chat.
  const endChatConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The findMatch loop re-joining the queue, if one is running. Aborted
  // whenever it stops being wanted (a match arrived, a newer re-join
  // started, or the user left), so it can't join while already chatting.
  const rejoinRef = useRef<AbortController | null>(null);
  // Set once the user leaves or the screen unmounts, so nothing reconnects after.
  const leavingRef = useRef(false);
  const latestRef = useRef({ tokenProvider, onReauthRequired, reportService });
  latestRef.current = { tokenProvider, onReauthRequired, reportService };
  // Bumped whenever the report sheet is torn down (chat ended, new match,
  // reconnect), so an in-flight report's result is dropped rather than
  // applied to a chat it wasn't about.
  const reportGenerationRef = useRef(0);
  const reportSubmittingRef = useRef(false);

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
      if (reportSnackbarTimerRef.current) {
        clearTimeout(reportSnackbarTimerRef.current);
      }
      if (endChatConfirmTimerRef.current) {
        clearTimeout(endChatConfirmTimerRef.current);
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

  const resetReport = useCallback(() => {
    reportGenerationRef.current += 1;
    reportSubmittingRef.current = false;
    setShowReportSheet(false);
    setReportSubmitting(false);
  }, []);

  const showReportSnackbar = useCallback((snackbar: ReportSnackbar) => {
    if (reportSnackbarTimerRef.current) {
      clearTimeout(reportSnackbarTimerRef.current);
    }
    setReportSnackbar(snackbar);
    reportSnackbarTimerRef.current = setTimeout(() => setReportSnackbar(null), REPORT_SNACKBAR_MS);
  }, []);

  /** Stops waiting for a reported chat's chat_ended; true if we were waiting. */
  const clearEndChatConfirm = useCallback(() => {
    if (!endChatConfirmTimerRef.current) {
      return false;
    }
    clearTimeout(endChatConfirmTimerRef.current);
    endChatConfirmTimerRef.current = null;
    return true;
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
   * Ends the chat by closing our socket — the server ends it at once — then
   * reconnects and re-joins. The fallback when end_chat can't be used or
   * isn't confirmed; the partner sees `disconnected` instead of `ended`.
   */
  const reconnectAndRejoin = useCallback(() => {
    clearEndChatConfirm();
    if (leavingRef.current) {
      return;
    }
    serviceRef.current.disconnect();
    rejoin(true);
  }, [clearEndChatConfirm, rejoin]);

  /**
   * Leaves the chat after a report (sent or not) and looks for someone new.
   * The server doesn't requeue us after end_chat, so we join_chat ourselves
   * once chat_ended {ended, by: self} confirms the chat is over.
   */
  const leaveReportedChat = useCallback(
    (canEndChat: boolean) => {
      setRematchReason('you_skipped');
      setRematchState('rematching');
      if (!canEndChat) {
        reconnectAndRejoin();
        return;
      }
      clearEndChatConfirm();
      serviceRef.current.sendEndChat();
      endChatConfirmTimerRef.current = setTimeout(reconnectAndRejoin, END_CHAT_CONFIRM_TIMEOUT_MS);
    },
    [clearEndChatConfirm, reconnectAndRejoin],
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
    clearEndChatConfirm();
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    isTypingRef.current = false;
    setPartnerTyping(false);
    setShowLeaveConfirm(false);
    resetReport();
    setReplyingTo(null);
    setMessages([{ id: nextMessageId(), sender: 'system', text: DISCONNECTED_MESSAGE }]);
    setRematchReason('reconnecting');
    setRematchState('rematching');
    serviceRef.current.disconnect();
    rejoin(true);
  }, [abortRejoin, clearEndChatConfirm, rejoin, resetReport]);

  useAppForeground(resume);

  useEffect(() => {
    // A skip is driven entirely by these two server events rather than the
    // button tap itself, so the "finding someone new" state appears the
    // same way for both people in the chat — whichever of them tapped Skip.
    const unsubscribeChatEnded = chatSocketService.onChatEnded(event => {
      // Whatever was open, there's no partner left to save, leave or report.
      setShowLeaveConfirm(false);
      resetReport();
      // Whichever chat_ended arrives settles a pending leave-after-report.
      const leavingReportedChat = clearEndChatConfirm();
      if (event.reason === 'ended' && event.by === 'self' && leavingReportedChat) {
        // Our end_chat after a report went through — now look for someone new.
        rejoin(false);
        return;
      }
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
      resetReport();
      setMessages([{ id: nextMessageId(), sender: 'system', text: CONNECTED_MESSAGE }]);
      setReplyingTo(null);
      setSkipSecondsRemaining(SKIP_UNLOCK_SECONDS);
    });
    // The backend reports throttled events only through `error`, so without
    // this a rate-limited skip (or message) would silently do nothing.
    const unsubscribeServerError = chatSocketService.onServerError(event => {
      if (event.reason === 'not_in_chat') {
        // Our end_chat after a report found the chat already over — join now.
        if (clearEndChatConfirm()) {
          rejoin(false);
          return;
        }
        // The server thinks we're not chatting but the UI does: we missed
        // a disconnect. Only meaningful while the UI shows a live chat.
        if (rematchStateRef.current === 'idle') {
          resume();
        }
        return;
      }
      // Most likely our end_chat after a report was throttled, so the chat is
      // still running — end it by reconnecting rather than waiting it out.
      if (event.reason === 'rate_limited' && endChatConfirmTimerRef.current) {
        reconnectAndRejoin();
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
  }, [chatSocketService, showToast, rejoin, resume, abortRejoin, resetReport, clearEndChatConfirm, reconnectAndRejoin]);

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

  const handleOpenReport = useCallback(() => {
    // Once the chat has ended there's no partner the report would reach.
    if (rematchStateRef.current !== 'idle') {
      return;
    }
    setShowLeaveConfirm(false);
    setShowReportSheet(true);
  }, []);

  const handleDismissReport = useCallback(() => {
    if (reportSubmittingRef.current) {
      return;
    }
    setShowReportSheet(false);
  }, []);

  const handleSubmitReport = useCallback(
    async (reportType: ReportType, description?: string) => {
      if (reportSubmittingRef.current) {
        return;
      }
      reportSubmittingRef.current = true;
      setReportSubmitting(true);
      const generation = reportGenerationRef.current;
      const isStale = () => generation !== reportGenerationRef.current || leavingRef.current;

      const result = await submitReportWithRetries({
        reportService: latestRef.current.reportService,
        tokenProvider: latestRef.current.tokenProvider,
        getSocketId: () => serviceRef.current.getSocketId(),
        reportType,
        description,
        isStale,
      });
      if (result === null || isStale()) {
        return;
      }

      if (result.status === 'reauth_required') {
        console.error('[Chat] Session expired and could not be refreshed — sending back to Entry.');
        leavingRef.current = true;
        serviceRef.current.disconnect();
        latestRef.current.onReauthRequired();
        return;
      }

      resetReport();
      switch (result.status) {
        case 'reported':
          showReportSnackbar({ text: REPORT_SUCCESS_MESSAGE, tone: 'success' });
          break;
        case 'nothing_to_report':
          showReportSnackbar({ text: REPORT_CHAT_ENDED_MESSAGE, tone: 'error' });
          break;
        default:
          console.error('[Chat] Could not send the report.', result);
          showReportSnackbar({ text: REPORT_FAILED_MESSAGE, tone: 'error' });
      }
      // With no live socket there's nothing to send end_chat on.
      leaveReportedChat(result.status !== 'offline');
    },
    [resetReport, showReportSnackbar, leaveReportedChat],
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (rematchState === 'rematching') {
        // Same exit as the "Stop searching" button — no partner to save,
        // so back just leaves the same way that button already does.
        handleStopSearching();
        return true;
      }
      if (showReportSheet) {
        handleDismissReport();
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
  }, [rematchState, showLeaveConfirm, showReportSheet, handleStopSearching, handleDismissReport]);

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
    showReportSheet,
    reportSubmitting,
    reportSnackbar,
    handleOpenReport,
    handleDismissReport,
    handleSubmitReport,
  };
}
