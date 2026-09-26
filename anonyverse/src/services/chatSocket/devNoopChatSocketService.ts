import type { ChatSocketService } from './ChatSocketService';

/** A ChatSocketService that talks to nothing — lets the Chat screen's UI be previewed from the DEV Menu without a backend or a real match. */
export function createDevNoopChatSocketService(): ChatSocketService {
  return {
    connect: () => Promise.resolve(),
    joinChat: () => Promise.resolve({ ok: true, status: 'matched' }),
    onMatchFound: () => () => {},
    onQueued: () => () => {},
    sendMessage: text => {
      console.log('[DevChat] sendMessage (no-op, nothing is listening):', text);
    },
    onReceiveMessage: () => () => {},
    sendTyping: () => {},
    sendTypingStop: () => {},
    onPartnerTyping: () => () => {},
    onPartnerTypingStop: () => () => {},
    sendSkipChat: () => {
      console.log('[DevChat] sendSkipChat (no-op, nothing is listening)');
    },
    sendEndChat: () => {
      console.log('[DevChat] sendEndChat (no-op, nothing is listening)');
    },
    onChatEnded: () => () => {},
    onServerError: () => () => {},
    onConnectionLost: () => () => {},
    getSocketId: () => 'dev-socket',
    disconnect: () => {},
  };
}
