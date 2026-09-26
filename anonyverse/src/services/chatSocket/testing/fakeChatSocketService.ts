import type { AccessTokenResult, TokenProvider } from '../../session/tokenProvider';
import type { ChatSocketService } from '../ChatSocketService';
import type {
  ChatEndedEvent,
  JoinChatAck,
  MatchFoundEvent,
  QueuedEvent,
  ReceiveMessageEvent,
  ServerErrorEvent,
} from '../types';

/** Test-only: a ChatSocketService whose server events are driven by the test. */

function handlerSet<T>() {
  const handlers = new Set<(event: T) => void>();
  return {
    emit: (event: T) => [...handlers].forEach(handler => handler(event)),
    subscribe: (handler: (event: T) => void) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}

export interface FakeChatSocketServiceOptions {
  connectImpl?: () => Promise<void>;
  joinChatImpl?: () => Promise<JoinChatAck>;
}

export function makeFakeChatSocketService({
  connectImpl = () => Promise.resolve(),
  joinChatImpl = () => Promise.resolve({ ok: true, status: 'queued' }),
}: FakeChatSocketServiceOptions = {}) {
  const matchFound = handlerSet<MatchFoundEvent>();
  const queued = handlerSet<QueuedEvent>();
  const receiveMessage = handlerSet<ReceiveMessageEvent>();
  const partnerTyping = handlerSet<void>();
  const partnerTypingStop = handlerSet<void>();
  const chatEnded = handlerSet<ChatEndedEvent>();
  const serverError = handlerSet<ServerErrorEvent>();
  const connectionLost = handlerSet<void>();

  const connect = jest.fn((_getAccessToken: () => string | null) => connectImpl());
  const joinChat = jest.fn((_tags: string[], _mood: string, _optedIn: boolean) => joinChatImpl());
  const sendMessage = jest.fn();
  const sendTyping = jest.fn();
  const sendTypingStop = jest.fn();
  const sendSkipChat = jest.fn();
  const sendEndChat = jest.fn();
  const getSocketId = jest.fn((): string | null => 'sid-1');
  // Like the real service, closing the socket ourselves is not a lost connection.
  const disconnect = jest.fn();

  const service: ChatSocketService = {
    connect,
    joinChat,
    onMatchFound: matchFound.subscribe,
    onQueued: queued.subscribe,
    sendMessage,
    onReceiveMessage: receiveMessage.subscribe,
    sendTyping,
    sendTypingStop,
    onPartnerTyping: handler => partnerTyping.subscribe(() => handler()),
    onPartnerTypingStop: handler => partnerTypingStop.subscribe(() => handler()),
    sendSkipChat,
    sendEndChat,
    onChatEnded: chatEnded.subscribe,
    onServerError: serverError.subscribe,
    onConnectionLost: handler => connectionLost.subscribe(() => handler()),
    getSocketId,
    disconnect,
  };

  return {
    service,
    connect,
    joinChat,
    sendMessage,
    sendTyping,
    sendTypingStop,
    sendSkipChat,
    sendEndChat,
    getSocketId,
    disconnect,
    emitMatchFound: (event: MatchFoundEvent = { partner: 'partner-2' }) => matchFound.emit(event),
    emitQueued: () => queued.emit({ partner: null }),
    emitReceiveMessage: receiveMessage.emit,
    emitPartnerTyping: () => partnerTyping.emit(),
    emitPartnerTypingStop: () => partnerTypingStop.emit(),
    emitChatEnded: chatEnded.emit,
    emitServerError: serverError.emit,
    /** A drop we didn't cause (backgrounded, lost network). */
    emitConnectionLost: () => connectionLost.emit(),
  };
}

export function makeFakeTokenProvider(
  results: AccessTokenResult | AccessTokenResult[] = { status: 'ok', accessToken: 'access-token' },
) {
  const queue = Array.isArray(results) ? [...results] : [results];
  const getFreshAccessToken = jest.fn((_options?: { forceRefresh?: boolean }) =>
    // The last result repeats once the queue runs out.
    Promise.resolve(queue.length > 1 ? queue.shift()! : queue[0]),
  );
  const tokenProvider: TokenProvider = {
    getFreshAccessToken,
    peekAccessToken: () => 'access-token',
  };
  return { tokenProvider, getFreshAccessToken };
}
