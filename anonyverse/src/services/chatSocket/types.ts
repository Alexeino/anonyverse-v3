export type JoinChatStatus = 'matched' | 'queued' | 'rate_limited' | 'offline';

export interface JoinChatAck {
  ok: boolean;
  status: JoinChatStatus;
}


export interface MatchFoundEvent {
  partner: string;
}

/** Sent only after a skip, when the server requeued us and no one was free yet. */
export interface QueuedEvent {
  partner: null;
}


export interface ReceiveMessageEvent {
  message: string;
}


export type ChatEndedReason = 'skipped' | 'ended' | 'disconnected';
export type ChatEndedBy = 'self' | 'partner';

export interface ChatEndedEvent {
  reason: ChatEndedReason;
  by: ChatEndedBy;
}


/** Server-emitted `error` event, e.g. `{ code: 429, reason: 'rate_limited' }` when an event is throttled. */
export interface ServerErrorEvent {
  code: number;
  reason: string;
}


export type ChatSocketConnectErrorReason =
  | 'AUTH_ERROR'
  | 'MISSING_TOKEN'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'CONNECTION_TIMEOUT'
  | 'UNKNOWN_ERROR';

export interface ChatSocketConnectError {
  reason: ChatSocketConnectErrorReason;
  raw?: unknown;
}

/** Rejection reason for joinChat() when no ack arrives (e.g. none of the tags were allowed) or the socket drops first. */
export type JoinChatErrorReason = 'JOIN_TIMEOUT' | 'NOT_CONNECTED';

export interface JoinChatError {
  reason: JoinChatErrorReason;
}
