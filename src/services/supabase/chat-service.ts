import type { ChatMessage, Contact } from '../../app/types.js';
import { mapConversationMessages } from './message-mapper.js';
import type { SupabasePort } from './port.js';
import { requireData } from './port.js';
import type { AdminInboxRow, SupabaseAttachment, SupabaseCallRow, SupabaseMessageRow } from './types.js';

export interface AdminDirectoryEntry {
  conversationId: string;
  contact: Contact;
}

export interface ConversationLoadInput {
  conversationId: string;
  localProfileId: string;
  peerProfileId: string;
}

export interface SendTextInput {
  conversationId: string;
  clientMessageId: string;
  text: string;
  replyToId?: string | null;
}

export interface SendAttachmentInput {
  conversationId: string;
  localProfileId: string;
  clientMessageId: string;
  kind: 'image' | 'file' | 'audio';
  file: File;
  text?: string;
  durationSeconds?: number;
  groupId?: string;
  groupIndex?: number;
  groupTotal?: number;
  replyToId?: string | null;
}

export class SupabaseChatService {
  constructor(private readonly port: SupabasePort) {}

  async loadAdminDirectory(): Promise<AdminDirectoryEntry[]> {
    const rows = requireData(await this.port.rpc<AdminInboxRow[]>('chat_admin_support_inbox', { p_limit: 100 }), 'admin inbox');
    return rows.map((row) => ({ conversationId: row.conversation_id, contact: inboxContact(row) }));
  }

  async loadConversation(input: ConversationLoadInput): Promise<ChatMessage[]> {
    const rows = requireData(await this.port.select<SupabaseMessageRow>('chat_messages', {
      columns: 'id,conversation_id,sender_id,client_message_id,type,text,reply_to_id,created_at,edited_at,revoked_at,call_id,attachment',
      eq: { conversation_id: input.conversationId },
      order: { column: 'created_at', ascending: true }
    }), 'load messages');

    const members = requireData(await this.port.select<{ profile_id: string; last_read_at: string | null }>('chat_conversation_members', {
      columns: 'profile_id,last_read_at',
      eq: { conversation_id: input.conversationId }
    }), 'load read state');
    const peerLastReadAt = members.find((row) => row.profile_id === input.peerProfileId)?.last_read_at ?? null;

    const callIds = [...new Set(rows.map((row) => row.call_id).filter((value): value is string => Boolean(value)))];
    const callRows = callIds.length
      ? requireData(await this.port.select<SupabaseCallRow>('chat_calls', {
          columns: 'id,caller_profile_id,callee_profile_id,state,connected_at,ended_at,end_reason',
          in: { id: callIds }
        }), 'load calls')
      : [];

    const paths = [...new Set(rows.map((row) => row.attachment?.path).filter((value): value is string => Boolean(value)))];
    const attachmentUrls = new Map<string, string>();
    if (paths.length) {
      const signed = requireData(await this.port.storage.createSignedUrls('chat-attachments', paths, 3600), 'sign attachments');
      for (const item of signed) if (item.path && item.signedUrl) attachmentUrls.set(item.path, item.signedUrl);
    }

    return mapConversationMessages(rows, {
      localProfileId: input.localProfileId,
      peerProfileId: input.peerProfileId,
      peerLastReadAt,
      attachmentUrls,
      callRows: new Map(callRows.map((row) => [row.id, row]))
    });
  }

  async sendText(input: SendTextInput): Promise<void> {
    requireData(await this.port.rpc<unknown>('chat_send_text_message', {
      p_conversation_id: input.conversationId,
      p_client_message_id: input.clientMessageId,
      p_text: input.text,
      p_reply_to_id: input.replyToId ?? null
    }), 'send text');
  }

  async sendAttachment(input: SendAttachmentInput): Promise<void> {
    const safeName = sanitizeFileName(input.file.name || `${input.kind}.bin`);
    const path = `${input.conversationId}/${input.localProfileId}/${input.clientMessageId}-${safeName}`;
    requireData(await this.port.storage.upload('chat-attachments', path, input.file, {
      contentType: input.file.type || 'application/octet-stream',
      upsert: false
    }), 'upload attachment');

    const attachment: SupabaseAttachment = {
      kind: input.kind,
      name: input.file.name || safeName,
      mime: input.file.type || 'application/octet-stream',
      path,
      size: input.file.size,
      ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds }),
      ...(input.groupId ? { group_id: input.groupId } : {}),
      ...(input.groupIndex === undefined ? {} : { group_index: input.groupIndex }),
      ...(input.groupTotal === undefined ? {} : { group_total: input.groupTotal }),
      ...(input.replyToId ? { reply_to_id: input.replyToId } : {})
    };
    const result = await this.port.rpc<unknown>('chat_send_attachment_message', {
      p_conversation_id: input.conversationId,
      p_client_message_id: input.clientMessageId,
      p_type: input.kind,
      p_attachment: attachment,
      p_text: input.text?.trim() || null
    });
    if (result.error) {
      await this.port.storage.remove('chat-attachments', [path]).catch(() => undefined);
      throw new Error(`send attachment: ${result.error.message}`);
    }
  }

  async markRead(conversationId: string): Promise<void> {
    const result = await this.port.rpc<null>('chat_mark_conversation_read', { target_conversation_id: conversationId });
    if (result.error) throw new Error(`mark read: ${result.error.message}`);
  }

  subscribe(conversationId: string, onChange: (kind: 'message' | 'read' | 'call') => void): () => void {
    return this.port.subscribeToConversation(conversationId, {
      onMessageChange: () => onChange('message'),
      onReadChange: () => onChange('read'),
      onCallChange: () => onChange('call')
    });
  }
}

function inboxContact(row: AdminInboxRow): Contact {
  const guest = row.identity_type === 'guest' || row.user_level === 1;
  return {
    id: row.profile_id,
    name: row.display_name,
    initials: initials(row.display_name),
    accountType: guest ? 'guest' : 'customer',
    customerGroupId: null,
    username: row.username,
    password: null,
    lastMessage: row.last_message_text ?? '',
    lastMessageAt: row.last_message_at ?? row.customer_last_seen_at ?? new Date(0).toISOString(),
    unread: Math.max(0, Number(row.unread_count) || 0)
  };
}

function initials(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

function sanitizeFileName(value: string): string {
  const clean = value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return clean.slice(0, 96) || 'attachment.bin';
}
