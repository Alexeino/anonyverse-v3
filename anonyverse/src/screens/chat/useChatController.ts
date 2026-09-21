import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatSocketService } from '../../services/chatSocket/ChatSocketService';

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

export interface UseChatControllerResult {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (value: string) => void;
  introDismissed: boolean;
  handleDismissIntro: () => void;
  handleSend: () => void;
  handleLeave: () => void;
  skipSecondsRemaining: number;
  canSkip: boolean;
  partnerTyping: boolean;
  replyingTo: ReplyPreview | null;
  handleReply: (message: ChatMessage) => void;
  handleCancelReply: () => void;
}

const SKIP_UNLOCK_SECONDS = 10;

const TYPING_STOP_DELAY_MS = 4000;

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


export function useChatController(chatSocketService: ChatSocketService, onLeave: () => void): UseChatControllerResult {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: nextMessageId(), sender: 'system', text: "Connected with anonymous partner. Say Hi!" },
  ]);
  const [inputValue, setInputValueState] = useState('');
  const [introDismissed, setIntroDismissed] = useState(false);
  const [skipSecondsRemaining, setSkipSecondsRemaining] = useState(SKIP_UNLOCK_SECONDS);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyPreview | null>(null);
  const serviceRef = useRef(chatSocketService);
  serviceRef.current = chatSocketService;
  const isTypingRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      serviceRef.current.disconnect();
    };
  }, [chatSocketService]);

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

  const handleLeave = useCallback(() => {
    if (skipSecondsRemaining > 0) {
      return;
    }
    serviceRef.current.disconnect();
    onLeave();
  }, [onLeave, skipSecondsRemaining]);

  return {
    messages,
    inputValue,
    setInputValue,
    introDismissed,
    handleDismissIntro,
    handleSend,
    handleLeave,
    skipSecondsRemaining,
    canSkip: skipSecondsRemaining <= 0,
    partnerTyping,
    replyingTo,
    handleReply,
    handleCancelReply,
  };
}
