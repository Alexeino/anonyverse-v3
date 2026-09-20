import type { ChatSocketService } from './ChatSocketService';

/** A ChatSocketService that talks to nothing — lets the Chat screen's UI be previewed from the DEV Menu without a backend or a real match. */
export function createDevNoopChatSocketService(): ChatSocketService {
  return {
    connect: () => Promise.resolve(),
    joinChat: () => Promise.resolve({ ok: true, status: 'matched' }),
    onMatchFound: () => () => {},
    sendMessage: text => {
      console.log('[DevChat] sendMessage (no-op, nothing is listening):', text);
    },
    onReceiveMessage: () => () => {},
    sendTyping: () => {},
    sendTypingStop: () => {},
    onPartnerTyping: () => () => {},
    onPartnerTypingStop: () => () => {},
    disconnect: () => {},
  };
}
