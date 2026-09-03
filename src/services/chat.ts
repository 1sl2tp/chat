import type { ChatMessage } from '../app/types.js';

export interface ChatService {
  loadConversation(peerId: string): Promise<ChatMessage[]>;
  sendMessage(peerId: string, message: ChatMessage): Promise<void>;
  subscribe(peerId: string, onMessage: (message: ChatMessage) => void): () => void;
}
