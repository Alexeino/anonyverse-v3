import type { ChatEndedEvent, JoinChatAck, MatchFoundEvent, ReceiveMessageEvent, ServerErrorEvent } from './types';


export interface ChatSocketService {
  connect(accessToken: string, topic: string | null): Promise<void>;

  joinChat(tags: string[], mood: string, optedIn: boolean): Promise<JoinChatAck>;


  onMatchFound(handler: (event: MatchFoundEvent) => void): () => void;

  sendMessage(text: string): void;


  onReceiveMessage(handler: (event: ReceiveMessageEvent) => void): () => void;

  sendTyping(): void;

  sendTypingStop(): void;

  onPartnerTyping(handler: () => void): () => void;

  onPartnerTypingStop(handler: () => void): () => void;

  sendSkipChat(): void;

  /** Ends the current chat without automatically re-queueing (docs/api.md `end_chat`). */
  sendEndChat(): void;

  onChatEnded(handler: (event: ChatEndedEvent) => void): () => void;

  /** Server `error` events — how the backend reports a throttled `skip_chat`, `send_message`, etc. */
  onServerError(handler: (event: ServerErrorEvent) => void): () => void;

  /**
   * The connection dropped without this client asking to disconnect (network
   * loss, server restart). Reconnection is off, so the chat can't continue.
   */
  onConnectionLost(handler: () => void): () => void;

  disconnect(): void;
}
