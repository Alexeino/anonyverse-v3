/** The server's direct acknowledgement of a join_chat emit (see the backend's join_chat handler). */
export type JoinChatStatus = 'matched' | 'queued';

export interface JoinChatAck {
  ok: boolean;
  status: JoinChatStatus;
}

/** Payload of the server's match_found event — fires for both sides of a match. */
export interface MatchFoundEvent {
  partner: string;
}

/**
 * Reasons a socket connection attempt can fail, per docs/api.md's
 * Connection section: connect_error's `reason` field maps to AUTH_ERROR
 * ('invalid_token') or MISSING_TOKEN ('missing_token'), anything else is
 * UNKNOWN_ERROR; a client-side 10s connection timeout is CONNECTION_TIMEOUT.
 */
export type ChatSocketConnectErrorReason =
  | 'AUTH_ERROR'
  | 'MISSING_TOKEN'
  | 'CONNECTION_TIMEOUT'
  | 'UNKNOWN_ERROR';

export interface ChatSocketConnectError {
  reason: ChatSocketConnectErrorReason;
  raw?: unknown;
}
