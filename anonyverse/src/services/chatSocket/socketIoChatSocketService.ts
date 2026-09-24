import { io, type Socket } from 'socket.io-client';
import { env } from '../../config/env';
import type { ChatSocketService } from './ChatSocketService';
import type {
  ChatEndedEvent,
  ChatSocketConnectError,
  ChatSocketConnectErrorReason,
  JoinChatAck,
  MatchFoundEvent,
  ReceiveMessageEvent,
  ServerErrorEvent,
} from './types';

const CONNECTION_TIMEOUT_MS = 10_000;
const JOIN_CHAT_TIMEOUT_MS = 10_000;

/**
 * The backend's join_chat only recognises `"fl"` as the low mood (it sets the
 * require-opt-in flag for `mood == "fl"`), while the app models it as `'low'`.
 * Anything else is treated as a normal mood, so other values pass through.
 */
export function toBackendMood(mood: string): string {
  return mood === 'low' ? 'fl' : mood;
}

function joinChatOnSocket(
  activeSocket: Socket,
  tags: string[],
  mood: string,
  optedIn: boolean,
): Promise<JoinChatAck> {
  return new Promise<JoinChatAck>((resolve, reject) => {
    let settled = false;
    function settle(run: () => void) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      activeSocket.off('disconnect', onDisconnect);
      run();
    }

    const timeoutId = setTimeout(() => {
      settle(() => reject({ reason: 'UNKNOWN_ERROR' }));
    }, JOIN_CHAT_TIMEOUT_MS);

    function onDisconnect() {
      settle(() => reject({ reason: 'UNKNOWN_ERROR' }));
    }
    activeSocket.once('disconnect', onDisconnect);

    activeSocket.emit('join_chat', tags, mood, optedIn, (ack: JoinChatAck) => {
      settle(() => resolve(ack));
    });
  });
}

function mapConnectErrorReason(error: unknown): ChatSocketConnectErrorReason {
  const reason =
    (error as { data?: { reason?: string }; reason?: string } | undefined)?.data?.reason ??
    (error as { reason?: string } | undefined)?.reason;

  if (reason === 'invalid_token') {
    return 'AUTH_ERROR';
  }
  if (reason === 'missing_token') {
    return 'MISSING_TOKEN';
  }
  return 'UNKNOWN_ERROR';
}

export function createSocketIoChatSocketService(): ChatSocketService {
  let socket: Socket | null = null;
  const matchFoundHandlers = new Set<(event: MatchFoundEvent) => void>();
  const receiveMessageHandlers = new Set<(event: ReceiveMessageEvent) => void>();
  const partnerTypingHandlers = new Set<() => void>();
  const partnerTypingStopHandlers = new Set<() => void>();
  const chatEndedHandlers = new Set<(event: ChatEndedEvent) => void>();
  const serverErrorHandlers = new Set<(event: ServerErrorEvent) => void>();
  const connectionLostHandlers = new Set<() => void>();

  function handleMatchFound(event: MatchFoundEvent) {
    matchFoundHandlers.forEach(handler => handler(event));
  }

  function handleReceiveMessage(event: ReceiveMessageEvent) {
    receiveMessageHandlers.forEach(handler => handler(event));
  }

  function handlePartnerTyping() {
    partnerTypingHandlers.forEach(handler => handler());
  }

  function handlePartnerTypingStop() {
    partnerTypingStopHandlers.forEach(handler => handler());
  }

  function handleChatEnded(event: ChatEndedEvent) {
    chatEndedHandlers.forEach(handler => handler(event));
  }

  function handleServerError(event: ServerErrorEvent) {
    serverErrorHandlers.forEach(handler => handler(event));
  }

  function handleSocketDisconnect(reason: Socket.DisconnectReason) {
    // Our own disconnect() detaches this listener first; this also covers the
    // connect-timeout path, which disconnects before `connect` ever fired.
    if (reason === 'io client disconnect') {
      return;
    }
    connectionLostHandlers.forEach(handler => handler());
  }

  return {
    connect(accessToken, topic) {
      return new Promise<void>((resolve, reject) => {
        const isSecureScheme = /^https:\/\//.test(env.apiBaseUrl);
        if (!isSecureScheme && !__DEV__) {
          const error: ChatSocketConnectError = { reason: 'UNKNOWN_ERROR' };
          console.error(
            '[ChatSocket] Refusing to connect — API_BASE_URL must use https:// in production so the auth token is never sent in cleartext.',
          );
          reject(error);
          return;
        }
        if (!isSecureScheme && __DEV__) {
          console.warn(
            '[ChatSocket] API_BASE_URL is not https:// — the auth token will be sent in cleartext. Only use this against a trusted local backend.',
          );
        }

        const nextSocket = io(env.apiBaseUrl, {
          transports: ['websocket'],
          auth: { token: accessToken, topic },
          extraHeaders: __DEV__ ? { 'ngrok-skip-browser-warning': 'true' } : {},
          reconnection: false,
        });
        socket = nextSocket;
        nextSocket.on('match_found', handleMatchFound);
        nextSocket.on('receive_message', handleReceiveMessage);
        nextSocket.on('partner_typing', handlePartnerTyping);
        nextSocket.on('partner_typing_stop', handlePartnerTypingStop);
        nextSocket.on('chat_ended', handleChatEnded);
        nextSocket.on('error', handleServerError);
        nextSocket.on('disconnect', handleSocketDisconnect);

        let settled = false;
        function settle(run: () => void) {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          nextSocket.off('connect', onConnect);
          nextSocket.off('connect_error', onConnectError);
          run();
        }

        function rejectWith(error: ChatSocketConnectError) {
          reject(error);
        }

        const timeoutId = setTimeout(() => {
          settle(() => {
            nextSocket.disconnect();
            rejectWith({ reason: 'CONNECTION_TIMEOUT' });
          });
        }, CONNECTION_TIMEOUT_MS);

        function onConnect() {
          settle(resolve);
        }

        function onConnectError(error: unknown) {
          settle(() => rejectWith({ reason: mapConnectErrorReason(error), raw: error }));
        }

        nextSocket.on('connect', onConnect);
        nextSocket.on('connect_error', onConnectError);
      });
    },

    joinChat(tags, mood, optedIn) {
      if (!socket) {
        return Promise.reject<JoinChatAck>({ reason: 'UNKNOWN_ERROR' });
      }
      return joinChatOnSocket(socket, tags, toBackendMood(mood), optedIn);
    },

    onMatchFound(handler) {
      matchFoundHandlers.add(handler);
      return () => {
        matchFoundHandlers.delete(handler);
      };
    },

    sendMessage(text) {
      if (!socket) {
        return;
      }
      socket.emit('send_message', text);
    },

    onReceiveMessage(handler) {
      receiveMessageHandlers.add(handler);
      return () => {
        receiveMessageHandlers.delete(handler);
      };
    },

    sendTyping() {
      if (!socket) {
        return;
      }
      socket.emit('typing');
    },

    sendTypingStop() {
      if (!socket) {
        return;
      }
      socket.emit('typing_stop');
    },

    onPartnerTyping(handler) {
      partnerTypingHandlers.add(handler);
      return () => {
        partnerTypingHandlers.delete(handler);
      };
    },

    onPartnerTypingStop(handler) {
      partnerTypingStopHandlers.add(handler);
      return () => {
        partnerTypingStopHandlers.delete(handler);
      };
    },

    sendSkipChat() {
      if (!socket) {
        return;
      }
      socket.emit('skip_chat');
    },

    sendEndChat() {
      if (!socket) {
        return;
      }
      socket.emit('end_chat');
    },

    onChatEnded(handler) {
      chatEndedHandlers.add(handler);
      return () => {
        chatEndedHandlers.delete(handler);
      };
    },

    onServerError(handler) {
      serverErrorHandlers.add(handler);
      return () => {
        serverErrorHandlers.delete(handler);
      };
    },

    onConnectionLost(handler) {
      connectionLostHandlers.add(handler);
      return () => {
        connectionLostHandlers.delete(handler);
      };
    },

    disconnect() {
      if (!socket) {
        return;
      }
      socket.off('match_found', handleMatchFound);
      socket.off('receive_message', handleReceiveMessage);
      socket.off('partner_typing', handlePartnerTyping);
      socket.off('partner_typing_stop', handlePartnerTypingStop);
      socket.off('chat_ended', handleChatEnded);
      socket.off('error', handleServerError);
      socket.off('disconnect', handleSocketDisconnect);
      socket.disconnect();
      socket = null;
    },
  };
}
