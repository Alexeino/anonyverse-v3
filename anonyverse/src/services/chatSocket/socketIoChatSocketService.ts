import { io, type Socket } from 'socket.io-client';
import { env, isApiBaseUrlSecure } from '../../config/env';
import type { ChatSocketService } from './ChatSocketService';
import type {
  ChatEndedEvent,
  ChatSocketConnectError,
  ChatSocketConnectErrorReason,
  JoinChatAck,
  JoinChatError,
  MatchFoundEvent,
  QueuedEvent,
  ReceiveMessageEvent,
  ServerErrorEvent,
} from './types';

const CONNECTION_TIMEOUT_MS = 10_000;
// The server sends no ack at all when none of the tags are allowed (see
// docs/api.md "Known issues"), so an ack timeout is required, not defensive.
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
      settle(() => reject({ reason: 'JOIN_TIMEOUT' } satisfies JoinChatError));
    }, JOIN_CHAT_TIMEOUT_MS);

    function onDisconnect() {
      settle(() => reject({ reason: 'NOT_CONNECTED' } satisfies JoinChatError));
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

  switch (reason) {
    case 'invalid_token':
      return 'AUTH_ERROR';
    case 'missing_token':
      return 'MISSING_TOKEN';
    case 'rate_limited':
      return 'RATE_LIMITED';
    case 'unavailable':
      return 'UNAVAILABLE';
    default:
      return 'UNKNOWN_ERROR';
  }
}

export function createSocketIoChatSocketService(): ChatSocketService {
  let socket: Socket | null = null;
  // Rejects the connect() still waiting on `socket`'s handshake, if any.
  let abortPendingConnect: (() => void) | null = null;
  const matchFoundHandlers = new Set<(event: MatchFoundEvent) => void>();
  const queuedHandlers = new Set<(event: QueuedEvent) => void>();
  const receiveMessageHandlers = new Set<(event: ReceiveMessageEvent) => void>();
  const partnerTypingHandlers = new Set<() => void>();
  const partnerTypingStopHandlers = new Set<() => void>();
  const chatEndedHandlers = new Set<(event: ChatEndedEvent) => void>();
  const serverErrorHandlers = new Set<(event: ServerErrorEvent) => void>();
  const connectionLostHandlers = new Set<() => void>();

  function handleMatchFound(event: MatchFoundEvent) {
    matchFoundHandlers.forEach(handler => handler(event));
  }

  function handleQueued(event: QueuedEvent) {
    queuedHandlers.forEach(handler => handler(event));
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

  function closeSocket() {
    if (!socket) {
      return;
    }
    const closing = socket;
    socket = null;
    abortPendingConnect?.();
    abortPendingConnect = null;
    closing.off('match_found', handleMatchFound);
    closing.off('queued', handleQueued);
    closing.off('receive_message', handleReceiveMessage);
    closing.off('partner_typing', handlePartnerTyping);
    closing.off('partner_typing_stop', handlePartnerTypingStop);
    closing.off('chat_ended', handleChatEnded);
    closing.off('error', handleServerError);
    closing.off('disconnect', handleSocketDisconnect);
    closing.disconnect();
  }

  return {
    connect(getAccessToken) {
      closeSocket();

      return new Promise<void>((resolve, reject) => {
        if (!isApiBaseUrlSecure()) {
          reject({ reason: 'UNKNOWN_ERROR' } satisfies ChatSocketConnectError);
          return;
        }

        const nextSocket = io(env.apiBaseUrl, {
          transports: ['websocket'],
          // A callback, so every handshake sends the current token rather
          // than one captured when this socket was created.
          auth: callback => callback({ token: getAccessToken() }),
          extraHeaders: __DEV__ ? { 'ngrok-skip-browser-warning': 'true' } : {},
          // The server never resumes a session, so socket.io's own
          // reconnection would only produce an idle socket the UI doesn't
          // know about. The controllers reconnect and rejoin explicitly.
          reconnection: false,
        });
        socket = nextSocket;
        nextSocket.on('match_found', handleMatchFound);
        nextSocket.on('queued', handleQueued);
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
          abortPendingConnect = null;
          nextSocket.off('connect', onConnect);
          nextSocket.off('connect_error', onConnectError);
          run();
        }

        const timeoutId = setTimeout(() => {
          settle(() => {
            if (socket === nextSocket) {
              closeSocket();
            }
            reject({ reason: 'CONNECTION_TIMEOUT' } satisfies ChatSocketConnectError);
          });
        }, CONNECTION_TIMEOUT_MS);

        function onConnect() {
          settle(resolve);
        }

        function onConnectError(error: unknown) {
          settle(() => {
            if (socket === nextSocket) {
              closeSocket();
            }
            reject({ reason: mapConnectErrorReason(error), raw: error } satisfies ChatSocketConnectError);
          });
        }

        // Closed (or replaced by a newer connect) before the handshake
        // finished — settle now rather than waiting out the timeout.
        abortPendingConnect = () =>
          settle(() => reject({ reason: 'UNKNOWN_ERROR' } satisfies ChatSocketConnectError));

        nextSocket.on('connect', onConnect);
        nextSocket.on('connect_error', onConnectError);
      });
    },

    joinChat(tags, mood, optedIn) {
      if (!socket?.connected) {
        return Promise.reject({ reason: 'NOT_CONNECTED' } satisfies JoinChatError);
      }
      return joinChatOnSocket(socket, tags, toBackendMood(mood), optedIn);
    },

    onMatchFound(handler) {
      matchFoundHandlers.add(handler);
      return () => {
        matchFoundHandlers.delete(handler);
      };
    },

    onQueued(handler) {
      queuedHandlers.add(handler);
      return () => {
        queuedHandlers.delete(handler);
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

    disconnect: closeSocket,
  };
}
