export type JoinChatStatus = 'matched' | 'queued';

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


export type ChatSocketConnectErrorReason =
  | 'AUTH_ERROR'
  | 'MISSING_TOKEN'
  | 'CONNECTION_TIMEOUT'
  | 'UNKNOWN_ERROR';

export interface ChatSocketConnectError {
  reason: ChatSocketConnectErrorReason;
  raw?: unknown;
}
