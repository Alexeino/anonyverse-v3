import type {
  ChatEndedEvent,
  JoinChatAck,
  MatchFoundEvent,
  QueuedEvent,
  ReceiveMessageEvent,
  ServerErrorEvent,
} from './types';


export interface ChatSocketService {
  /**
   * Opens a fresh socket, closing any previous one first. The server never
   * resumes a session, so calling this again is how a reconnect happens.
   * `getAccessToken` is read on every handshake, so it always sends the
   * current token.
   */
  connect(getAccessToken: () => string | null): Promise<void>;

  /** Rejects with a JoinChatError if no ack arrives in time or the socket drops first. */
  joinChat(tags: string[], mood: string, optedIn: boolean): Promise<JoinChatAck>;


  onMatchFound(handler: (event: MatchFoundEvent) => void): () => void;

  /** After a skip the server requeues both sides itself; this says no one was free yet. */
  onQueued(handler: (event: QueuedEvent) => void): () => void;

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
