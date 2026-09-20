import type { JoinChatAck, MatchFoundEvent, ReceiveMessageEvent } from './types';


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

  disconnect(): void;
}
