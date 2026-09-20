import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatSocketService } from '../../services/chatSocket/ChatSocketService';

export interface ChatMessage {
  id: string;
  sender: 'me' | 'partner' | 'system';
  text: string;
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
}

const SKIP_UNLOCK_SECONDS = 10;

let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter += 1;
  return `msg-${messageIdCounter}`;
}

/**
 * Owns the Chat screen's message thread and its socket wiring. The
 * ChatSocketService passed in is already connected and matched (handed off
 * live from useFindingMatchController), so this hook only ever calls
 * sendMessage/onReceiveMessage/disconnect on it, never connect()/joinChat().
 * No message persistence — the thread is in-memory only.
 */
export function useChatController(chatSocketService: ChatSocketService, onLeave: () => void): UseChatControllerResult {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: nextMessageId(), sender: 'system', text: "Connected with anonymous partner. Say Hi!" },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [introDismissed, setIntroDismissed] = useState(false);
  const [skipSecondsRemaining, setSkipSecondsRemaining] = useState(SKIP_UNLOCK_SECONDS);
  const serviceRef = useRef(chatSocketService);
  serviceRef.current = chatSocketService;

  useEffect(() => {
    const timer = setInterval(() => {
      setSkipSecondsRemaining(current => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = chatSocketService.onReceiveMessage(event => {
      setMessages(current => [...current, { id: nextMessageId(), sender: 'partner', text: event.message }]);
    });

    return () => {
      unsubscribe();
      serviceRef.current.disconnect();
    };
  }, [chatSocketService]);

  const handleDismissIntro = useCallback(() => {
    setIntroDismissed(true);
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) {
      return;
    }
    serviceRef.current.sendMessage(text);
    setMessages(current => [...current, { id: nextMessageId(), sender: 'me', text }]);
    setInputValue('');
  }, [inputValue]);

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
  };
}
