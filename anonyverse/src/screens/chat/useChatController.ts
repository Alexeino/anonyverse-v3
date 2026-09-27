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

/** State of the one-tap "Report that chat" link on the "finding someone new" modal. */
export type QuickReportStatus = 'idle' | 'sending' | 'reported';

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
  /** Goes up by one each time the server confirms this user skipped their partner. */
  selfSkipCount: number;
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
   * Ends the chat (waiting for end_chat's ack), reports the partner, and only
   * once the report has finished looks for a new match. The server only accepts reports for an ended
   * chat; if end_chat isn't confirmed nothing is reported and we leave by
   * reconnecting instead.
   */
  handleSubmitReport: (reportType: ReportType, description?: string) => void;
  /** State of the one-tap "Report that chat" link while rematching. */
  quickReportStatus: QuickReportStatus;
  /**
   * Reports the chat that just ended, with no reason, while matchmaking
   * carries on. The report names that chat's partner, so a new match
   * meanwhile doesn't change who it reaches.
   */
  handleQuickReport: () => void;
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

// A report that failed on a 5xx or the network is retried after each of
// these delays. A report that returned 200 is never retried: the server
// doesn't deduplicate, so a retry would file a second report.
// Retries are off for now: a timed-out or dropped request may still have
// been stored, and a retry would then file it twice. A 401 is still retried
// once after a token refresh, since the server stored nothing.
const REPORT_RETRY_DELAYS_MS: number[] = [];
const REPORT_SNACKBAR_MS = 4000;
const REPORT_SUCCESS_MESSAGE = 'Reported successfully. Thanks, this helps us keep Anonyverse safe.';
// 404: the report window passed, it was already reported, or a newer chat has ended since.
const REPORT_NOT_REPORTABLE_MESSAGE = 'This chat can no longer be reported.';
const REPORT_FAILED_MESSAGE = "Couldn't send the report, but you've left that chat.";
const QUICK_REPORT_SUCCESS_MESSAGE = 'Reported. Thanks, this helps us keep Anonyverse safe.';
const QUICK_REPORT_FAILED_MESSAGE = "Couldn't send the report. Try again.";

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

type SubmitReportResult = ReportOutcome | { status: 'reauth_required' };

/**
 * Reports `reportedUserSid`, refreshing the token once on a 401 and retrying
 * 5xx/network failures with backoff. Resolves null once `isStale` says the
 * result is no longer wanted (the user left meanwhile).
 */
async function submitReportWithRetries({
  reportService,
  tokenProvider,
  reportedUserSid,
  reportType,
  description,
  isStale,
}: {
  reportService: ReportService;
  tokenProvider: TokenProvider;
  reportedUserSid: string;
  reportType?: ReportType;
  description?: string;
  isStale: () => boolean;
}): Promise<SubmitReportResult | null> {
  let forceRefresh = false;
  let retriedUnauthorized = false;
  let retries = 0;

  for (;;) {
    if (isStale()) {
      return null;
    }
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
      outcome = await reportService.reportUser({
        accessToken: tokenResult.accessToken,
        reportedUserSid,
        reportType,
        description,
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
      continue;
    }
    return outcome;
  }
}

/** mid_chat: the user ended a live chat. stopped_searching: the partner was already gone. */
export type ChatLeaveReason = 'mid_chat' | 'stopped_searching';

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
  partnerSid: string,
  selection: TopicsSelection,
  tokenProvider: TokenProvider,
  onLeave: (reason: ChatLeaveReason) => void,
  onReauthRequired: () => void,
  reportService: ReportService,
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
  const [selfSkipCount, setSelfSkipCount] = useState(0);
  const [skipUnavailableMessage, setSkipUnavailableMessage] = useState<string | null>(null);
  const [rematchStatusMessage, setRematchStatusMessage] = useState<string | null>(null);
  const [rematchGaveUp, setRematchGaveUp] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSnackbar, setReportSnackbar] = useState<ReportSnackbar | null>(null);
  const [quickReportStatus, setQuickReportStatus] = useState<QuickReportStatus>('idle');
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
  // The partner of the current chat — or, while rematching, of the chat that
  // just ended. Reports name this sid, so it only moves on at the next match.
  const partnerSidRef = useRef(partnerSid);
  // Set while a report's end_chat is waiting for its ack: the chat_ended
  // {ended, self} it produces must not tear down the report in progress.
  const endingForReportRef = useRef(false);
  // The findMatch loop re-joining the queue, if one is running. Aborted
  // whenever it stops being wanted (a match arrived, a newer re-join
  // started, or the user left), so it can't join while already chatting.
  const rejoinRef = useRef<AbortController | null>(null);
  // Set once the user leaves or the screen unmounts, so nothing reconnects after.
  const leavingRef = useRef(false);
  const latestRef = useRef({ tokenProvider, onReauthRequired, reportService });
  latestRef.current = { tokenProvider, onReauthRequired, reportService };
  // Bumped whenever the report sheet is torn down (chat ended, new match,
  // reconnect), so a report still waiting on end_chat is abandoned rather
  // than sent for a chat it wasn't about.
  const reportGenerationRef = useRef(0);
  const reportSubmittingRef = useRef(false);
  const quickReportStatusRef = useRef(quickReportStatus);
  quickReportStatusRef.current = quickReportStatus;

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
    endingForReportRef.current = false;
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
   * reconnects and re-joins. The fallback when end_chat isn't confirmed; the
   * partner sees `disconnected` instead of `ended`.
   */
  const reconnectAndRejoin = useCallback(() => {
    if (leavingRef.current) {
      return;
    }
    serviceRef.current.disconnect();
    rejoin(true);
  }, [rejoin]);

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
    resetReport();
    setReplyingTo(null);
    setMessages([{ id: nextMessageId(), sender: 'system', text: DISCONNECTED_MESSAGE }]);
    setRematchReason('reconnecting');
    setRematchState('rematching');
    serviceRef.current.disconnect();
    rejoin(true);
  }, [abortRejoin, rejoin, resetReport]);

  useAppForeground(resume);

  useEffect(() => {
    // A skip is driven entirely by these two server events rather than the
    // button tap itself, so the "finding someone new" state appears the
    // same way for both people in the chat — whichever of them tapped Skip.
    const unsubscribeChatEnded = chatSocketService.onChatEnded(event => {
      // Our own end_chat for a report: its ack drives what happens next.
      if (event.reason === 'ended' && event.by === 'self' && endingForReportRef.current) {
        return;
      }
      // Whatever was open, there's no partner left to save, leave or report.
      setShowLeaveConfirm(false);
      resetReport();
      if (event.reason === 'skipped') {
        // The server requeues both sides after a skip, and match_found or
        // queued follows on its own. Don't join_chat here: it would only
        // spend the join_chat rate limit.
        setRematchReason(event.by === 'self' ? 'you_skipped' : 'partner_skipped');
        if (event.by === 'self') {
          setSelfSkipCount(count => count + 1);
        }
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
    const unsubscribeMatchFound = chatSocketService.onMatchFound(event => {
      partnerSidRef.current = event.partner;
      quickReportStatusRef.current = 'idle';
      setQuickReportStatus('idle');
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
  }, [chatSocketService, showToast, rejoin, resume, abortRejoin, resetReport]);

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
    onLeave('stopped_searching');
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
    onLeave('mid_chat');
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

  /** Shows a finished report's outcome; `quick` picks the rematch link's wording. */
  const showReportOutcome = useCallback(
    (result: ReportOutcome | { status: 'reauth_required' }, quick: boolean) => {
      if (result.status === 'reauth_required') {
        console.error('[Chat] Session expired and could not be refreshed — sending back to Entry.');
        leavingRef.current = true;
        serviceRef.current.disconnect();
        latestRef.current.onReauthRequired();
        return;
      }
      switch (result.status) {
        case 'reported':
          showReportSnackbar({ text: quick ? QUICK_REPORT_SUCCESS_MESSAGE : REPORT_SUCCESS_MESSAGE, tone: 'success' });
          break;
        case 'nothing_to_report':
          showReportSnackbar({ text: REPORT_NOT_REPORTABLE_MESSAGE, tone: 'error' });
          break;
        case 'failed':
          // Log only what we produced — `error` may carry server response detail.
          console.error('[Chat] Could not send the report.', {
            status: result.status,
            retryable: result.retryable,
            error: result.error instanceof Error ? result.error.message : undefined,
          });
          showReportSnackbar({ text: quick ? QUICK_REPORT_FAILED_MESSAGE : REPORT_FAILED_MESSAGE, tone: 'error' });
          break;
        default:
          // A second 401.
          console.error('[Chat] Could not send the report.', { status: result.status });
          showReportSnackbar({ text: quick ? QUICK_REPORT_FAILED_MESSAGE : REPORT_FAILED_MESSAGE, tone: 'error' });
      }
    },
    [showReportSnackbar],
  );

  const handleSubmitReport = useCallback(
    async (reportType: ReportType, description?: string) => {
      if (reportSubmittingRef.current) {
        return;
      }
      reportSubmittingRef.current = true;
      setReportSubmitting(true);
      const generation = reportGenerationRef.current;
      const reportedUserSid = partnerSidRef.current;

      // The server only takes reports for an ended chat, so end it first.
      endingForReportRef.current = true;
      let ended = false;
      try {
        const ack = await serviceRef.current.endChat();
        ended = ack.ok;
        if (!ack.ok) {
          console.error('[Chat] end_chat was not confirmed before reporting.', { status: ack.status });
        }
      } catch (error) {
        console.error('[Chat] end_chat was not confirmed before reporting.', error);
      }
      if (leavingRef.current) {
        return;
      }
      // The chat ended some other way meanwhile (partner left or skipped,
      // our socket dropped): it's over either way, and that path has already
      // started the rematch.
      const endedElsewhere = generation !== reportGenerationRef.current;
      if (!endedElsewhere) {
        resetReport();
        setRematchReason('you_skipped');
        setRematchState('rematching');
        if (!ended) {
          // Don't report a chat the server may not have ended. Closing our
          // socket does end it, and the rematch modal's link can report it then.
          showReportSnackbar({ text: REPORT_FAILED_MESSAGE, tone: 'error' });
          reconnectAndRejoin();
          return;
        }
        // end_chat doesn't requeue us. The re-join waits for the report
        // below: joining now could match this same partner again before the
        // report's 5-minute block exists. end_chat's own 20s block covers a
        // report that fails.
      }
      quickReportStatusRef.current = 'sending';
      setQuickReportStatus('sending');
      const result = await submitReportWithRetries({
        reportService: latestRef.current.reportService,
        tokenProvider: latestRef.current.tokenProvider,
        reportedUserSid,
        reportType,
        description,
        isStale: () => leavingRef.current,
      });
      if (result === null || leavingRef.current) {
        return;
      }
      // Only while this chat's rematch link is still showing.
      if (partnerSidRef.current === reportedUserSid) {
        // After a success the link would report the same partner again (the
        // server doesn't deduplicate).
        const nextStatus = result.status === 'reported' ? 'reported' : 'idle';
        quickReportStatusRef.current = nextStatus;
        setQuickReportStatus(nextStatus);
      }
      // Unlike the quick report, a failure is still shown over a new chat:
      // the user explicitly submitted this one, and no retry link is implied.
      showReportOutcome(result, false);
      // Re-join now that the report is done, whatever its outcome — unless
      // the session expired, or something else already started a re-join
      // (a reconnect) or a new chat meanwhile.
      if (
        !endedElsewhere &&
        result.status !== 'reauth_required' &&
        !leavingRef.current &&
        rejoinRef.current === null &&
        rematchStateRef.current === 'rematching' &&
        partnerSidRef.current === reportedUserSid
      ) {
        rejoin(false);
      }
    },
    [resetReport, showReportSnackbar, reconnectAndRejoin, rejoin, showReportOutcome],
  );

  const handleQuickReport = useCallback(async () => {
    if (rematchStateRef.current !== 'rematching' || quickReportStatusRef.current !== 'idle') {
      return;
    }
    quickReportStatusRef.current = 'sending';
    setQuickReportStatus('sending');
    // Still the partner of the chat that just ended: no new match yet.
    const reportedUserSid = partnerSidRef.current;

    const result = await submitReportWithRetries({
      reportService: latestRef.current.reportService,
      tokenProvider: latestRef.current.tokenProvider,
      reportedUserSid,
      isStale: () => leavingRef.current,
    });
    if (result === null || leavingRef.current) {
      return;
    }
    // An expired session ends the chat whether or not a new match arrived.
    if (result.status === 'reauth_required') {
      showReportOutcome(result, true);
      return;
    }

    if (partnerSidRef.current === reportedUserSid) {
      const nextStatus = result.status === 'reported' ? 'reported' : 'idle';
      quickReportStatusRef.current = nextStatus;
      setQuickReportStatus(nextStatus);
    } else if (result.status !== 'reported') {
      // A new chat has started: "Try again" would point at a link that's gone.
      return;
    }
    // The report named that chat's partner, so it's accurate even over a new chat.
    showReportOutcome(result, true);
  }, [showReportOutcome]);

  const handleBack = useCallback(() => {
    if (rematchState === 'rematching') {
      // Same exit as the "Stop searching" button — no partner to save,
      // so back just leaves the same way that button already does.
      handleStopSearching();
      return;
    }
    if (showReportSheet) {
      handleDismissReport();
      return;
    }
    if (showLeaveConfirm) {
      // Back dismisses the confirmation instead of doing nothing, so the
      // user is never stuck with no way to cancel out of the popup.
      setShowLeaveConfirm(false);
      return;
    }
    setShowLeaveConfirm(true);
  }, [rematchState, showReportSheet, showLeaveConfirm, handleStopSearching, handleDismissReport]);

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
    selfSkipCount,
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
    showReportSheet,
    reportSubmitting,
    reportSnackbar,
    handleOpenReport,
    handleDismissReport,
    handleSubmitReport,
    quickReportStatus,
    handleQuickReport,
  };
}
