import type { CallEventData, ChatMessage, MessageKind } from '../../app/types.js';
import type { MessageMapContext, SupabaseCallRow, SupabaseMessageRow } from './types.js';

const DATA_KINDS = new Set<MessageKind>(['text', 'image', 'file', 'audio']);

export function mapCallRow(row: SupabaseCallRow): CallEventData {
  const connected = row.connected_at ? Date.parse(row.connected_at) : Number.NaN;
  const ended = row.ended_at ? Date.parse(row.ended_at) : Number.NaN;
  if (Number.isFinite(connected)) {
    const durationSeconds = Number.isFinite(ended) ? Math.max(0, Math.round((ended - connected) / 1000)) : undefined;
    return {
      callerId: row.caller_profile_id,
      calleeId: row.callee_profile_id,
      outcome: 'completed',
      ...(durationSeconds === undefined ? {} : { durationSeconds })
    };
  }
  return {
    callerId: row.caller_profile_id,
    calleeId: row.callee_profile_id,
    outcome: row.state === 'cancelled' || row.end_reason === 'caller_cancelled' ? 'cancelled' : 'unanswered'
  };
}

export function mapConversationMessages(rows: readonly SupabaseMessageRow[], context: MessageMapContext): ChatMessage[] {
  const formatTime = context.formatTime ?? defaultFormatTime;
  const activeRows = rows.filter((row) => !row.revoked_at);
  const previewById = new Map<string, string>();
  for (const row of activeRows) {
    previewById.set(row.id, row.text?.trim() || row.attachment?.name || (row.type === 'call' ? 'Cuộc gọi' : 'Tin nhắn'));
  }

  const imageGroups = new Map<string, SupabaseMessageRow[]>();
  for (const row of activeRows) {
    const groupId = row.type === 'image' ? row.attachment?.group_id : undefined;
    if (!groupId) continue;
    const group = imageGroups.get(groupId) ?? [];
    group.push(row);
    imageGroups.set(groupId, group);
  }

  const consumed = new Set<string>();
  const messages: ChatMessage[] = [];
  for (const row of activeRows) {
    if (consumed.has(row.id)) continue;
    const groupId = row.type === 'image' ? row.attachment?.group_id : undefined;
    const group = groupId ? imageGroups.get(groupId) : undefined;
    if (group && group.length > 1) {
      const ordered = [...group].sort((a, b) => (a.attachment?.group_index ?? 0) - (b.attachment?.group_index ?? 0));
      for (const item of ordered) consumed.add(item.id);
      const first = ordered[0]!;
      const outgoing = first.sender_id === context.localProfileId;
      const message: ChatMessage = {
        id: first.id,
        senderId: first.sender_id,
        recipientId: outgoing ? context.peerProfileId : context.localProfileId,
        kind: 'image',
        time: formatTime(first.created_at),
        images: ordered.map((item) => {
          const attachment = item.attachment!;
          return context.attachmentUrls?.get(attachment.path) ?? attachment.path;
        })
      };
      const caption = ordered.find((item) => item.text?.trim())?.text;
      if (caption) message.text = caption;
      const replyToId = first.reply_to_id ?? first.attachment?.reply_to_id;
      if (replyToId) {
        message.replyToId = replyToId;
        message.replyTo = previewById.get(replyToId) ?? 'Tin nhắn';
      }
      messages.push(message);
      continue;
    }

    consumed.add(row.id);
    const kind = normalizeKind(row.type);
    const outgoing = row.sender_id === context.localProfileId;
    const attachment = row.attachment;
    const attachmentUrl = attachment ? context.attachmentUrls?.get(attachment.path) : undefined;
    const message: ChatMessage = {
      id: row.id,
      senderId: row.sender_id,
      recipientId: outgoing ? context.peerProfileId : context.localProfileId,
      kind,
      time: formatTime(row.created_at)
    };

    if (row.text) message.text = row.text;
    const replyToId = row.reply_to_id ?? attachment?.reply_to_id;
    if (replyToId) {
      message.replyToId = replyToId;
      message.replyTo = previewById.get(replyToId) ?? 'Tin nhắn';
    }

    if (kind === 'image' && attachment) message.images = [attachmentUrl ?? attachment.path];
    if (kind === 'file' && attachment) {
      message.fileName = attachment.name;
      message.fileUrl = attachmentUrl;
    }
    if (kind === 'audio' && attachment) {
      message.audioUrl = attachmentUrl;
      const duration = attachment.durationSeconds ?? attachment.duration_seconds;
      if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) message.audioDuration = duration;
    }
    if (kind === 'call' && row.call_id) {
      const callRow = context.callRows?.get(row.call_id);
      if (callRow) message.call = mapCallRow(callRow);
    }
    messages.push(message);
  }

  let latestOutgoing: ChatMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message && message.senderId === context.localProfileId && DATA_KINDS.has(message.kind)) {
      latestOutgoing = message;
      break;
    }
  }
  if (latestOutgoing) {
    const source = activeRows.find((row) => row.id === latestOutgoing.id);
    const groupId = source?.attachment?.group_id;
    const sourceRows = groupId ? (imageGroups.get(groupId) ?? [source].filter(Boolean) as SupabaseMessageRow[]) : (source ? [source] : []);
    const readAt = context.peerLastReadAt ? Date.parse(context.peerLastReadAt) : Number.NaN;
    const sentAt = Math.max(...sourceRows.map((item) => Date.parse(item.created_at)).filter(Number.isFinite));
    latestOutgoing.status = Number.isFinite(readAt) && Number.isFinite(sentAt) && readAt >= sentAt ? 'seen' : 'sent';
  }
  return messages;
}

function normalizeKind(type: string): MessageKind {
  if (type === 'image' || type === 'file' || type === 'audio' || type === 'call') return type;
  return 'text';
}

function defaultFormatTime(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
