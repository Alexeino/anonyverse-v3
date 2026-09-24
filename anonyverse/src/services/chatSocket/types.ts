export type JoinChatStatus = 'matched' | 'queued' | 'rate_limited';

export interface JoinChatAck {
  ok: boolean;
  status: JoinChatStatus;
}


export interface MatchFoundEvent {
  partner: string;
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
  | 'CONNECTION_TIMEOUT'
  | 'UNKNOWN_ERROR';

export interface ChatSocketConnectError {
  reason: ChatSocketConnectErrorReason;
  raw?: unknown;
}
