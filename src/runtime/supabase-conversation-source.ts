import type { ChatMessage } from '../app/types.js';
import type { ChatConversationSource, ConversationChange, ConversationMediaPayload } from '../chat/live-conversation.js';
import { createUuid } from '../utils/id.js';
import type { SupabaseChatService } from '../services/supabase/chat-service.js';

export interface SupabaseConversationBinding {
  conversationId: string;
  localProfileId: string;
  peerProfileId: string;
}

export class SupabaseConversationSource implements ChatConversationSource {
  constructor(
    private readonly service: SupabaseChatService,
    private readonly binding: SupabaseConversationBinding
  ) {}

  load(): Promise<ChatMessage[]> {
    return this.service.loadConversation(this.binding);
  }

  async send(message: ChatMessage, media?: ConversationMediaPayload): Promise<void> {
    if (message.kind === 'text') {
      const text = message.text?.trim() ?? '';
      if (!text) throw new Error('empty text message');
      await this.service.sendText({
        conversationId: this.binding.conversationId,
        clientMessageId: message.id,
        text,
        replyToId: message.replyToId ?? null
      });
      return;
    }

    if (message.kind === 'image') {
      const files = media?.imageFiles ?? [];
      if (!files.length) throw new Error('image files required');
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!file) continue;
        await this.service.sendAttachment({
          conversationId: this.binding.conversationId,
          localProfileId: this.binding.localProfileId,
          clientMessageId: index === 0 ? message.id : createUuid(),
          kind: 'image',
          file,
          text: index === 0 ? message.text : undefined,
          groupId: message.id,
          groupIndex: index,
          groupTotal: files.length,
          replyToId: message.replyToId ?? null
        });
      }
      return;
    }

    if (message.kind === 'file') {
      const file = media?.file;
      if (!file) throw new Error('file required');
      await this.service.sendAttachment({
        conversationId: this.binding.conversationId,
        localProfileId: this.binding.localProfileId,
        clientMessageId: message.id,
        kind: 'file',
        file,
        text: message.text,
        replyToId: message.replyToId ?? null
      });
      return;
    }

    if (message.kind === 'audio') {
      const file = media?.audioFile;
      if (!file) throw new Error('audio recording file required');
      await this.service.sendAttachment({
        conversationId: this.binding.conversationId,
        localProfileId: this.binding.localProfileId,
        clientMessageId: message.id,
        kind: 'audio',
        file,
        durationSeconds: message.audioDuration,
        replyToId: message.replyToId ?? null
      });
      return;
    }

    throw new Error(`unsupported live message kind: ${message.kind}`);
  }

  markRead(): Promise<void> {
    return this.service.markRead(this.binding.conversationId);
  }

  subscribe(onChange: (kind: ConversationChange) => void): () => void {
    return this.service.subscribe(this.binding.conversationId, onChange);
  }
}
