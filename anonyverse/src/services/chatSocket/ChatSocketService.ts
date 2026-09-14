import type { JoinChatAck, MatchFoundEvent } from './types';

/**
 * Abstraction over the matchmaking half of the Realtime API (docs/api.md
 * §3). Deliberately scoped to just connect/join_chat/match_found/
 * disconnect — send_message, typing, report_user, skip_chat, and end_chat
 * belong to live chat, which doesn't have a screen yet.
 *
 * Screens/hooks must depend on this interface, never socket.io-client
 * directly, so the matchmaking controller can be tested without a real
 * socket. Implementations are created fresh per search — docs/api.md notes
 * the client always creates a new socket per search rather than reusing one.
 */
export interface ChatSocketService {
  /**
   * Connects to the backend and waits for the handshake to complete.
   * Resolves once 'connect' fires; rejects with a ChatSocketConnectError
   * on 'connect_error' or if no response arrives within 10s.
   */
  connect(accessToken: string, topic: string | null): Promise<void>;

  /**
   * Emits join_chat(tags, mood, optedIn) and resolves with the server's
   * direct acknowledgement ({ok, status}). Must only be called after
   * connect() has resolved.
   */
  joinChat(tags: string[], mood: string, optedIn: boolean): Promise<JoinChatAck>;

  /**
   * Subscribes to the match_found event (fires for either side of a
   * match). Returns a function that unsubscribes just this handler.
   */
  onMatchFound(handler: (event: MatchFoundEvent) => void): () => void;

  /**
   * Tears down the connection. The only way to leave the matchmaking
   * queue today — docs/api.md documents no dedicated "leave queue" event.
   * Safe to call more than once.
   */
  disconnect(): void;
}
