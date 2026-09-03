import type { ChatMessage } from '../app/types.js';

export type MessageActionLabel = 'Trả lời' | 'Sao chép' | 'Lưu' | 'Mở';
export type MediaType = 'image' | 'file' | 'link' | 'audio';

export interface ConversationMediaItem {
  id: string;
  type: MediaType;
  messageId: string;
  mediaIndex?: number;
  senderId: string;
  time: string;
  title: string;
  src?: string;
  url?: string;
  durationSeconds?: number;
}

const URL_RE = /https?:\/\/[^\s<]+/gi;

export function isOutgoing(message: ChatMessage, localParticipantId: string): boolean {
  return message.senderId === localParticipantId && message.recipientId !== null;
}

export function latestOutgoingStatusId(messages: ChatMessage[], localParticipantId: string): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.kind === 'system' || message.kind === 'call') continue;
    if (isOutgoing(message, localParticipantId)) return message.id;
  }
  return null;
}

export function extractLinks(text = ''): string[] {
  return [...text.matchAll(URL_RE)].map((match) => match[0].replace(/[),.;!?]+$/, ''));
}

export function messageActionLabels(message: ChatMessage): MessageActionLabel[] {
  if (message.kind === 'system' || message.kind === 'call') return [];
  if (message.kind === 'image' || message.kind === 'file' || message.kind === 'audio') return ['Trả lời', 'Lưu'];
  if (extractLinks(message.text).length) return ['Trả lời', 'Sao chép', 'Mở'];
  return ['Trả lời', 'Sao chép'];
}

export function formatCompactDuration(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function callEventView(message: ChatMessage, localParticipantId: string): { label: string; canCallBack: boolean } {
  if (message.kind !== 'call' || !message.call) return { label: '', canCallBack: false };
  const { callerId, outcome, durationSeconds = 0 } = message.call;
  const localIsCaller = callerId === localParticipantId;
  if (outcome === 'completed') {
    const direction = localIsCaller ? 'Gọi đi' : 'Gọi đến';
    return { label: `${direction} · ${formatCompactDuration(durationSeconds)}`, canCallBack: false };
  }
  if (localIsCaller) {
    return { label: outcome === 'cancelled' ? 'Đã hủy' : 'Không trả lời', canCallBack: false };
  }
  return { label: 'Cuộc gọi nhỡ', canCallBack: true };
}

export function collectConversationMedia(messages: ChatMessage[]): ConversationMediaItem[] {
  const items: ConversationMediaItem[] = [];
  for (const message of messages) {
    if (message.kind === 'image') {
      for (const [mediaIndex, src] of (message.images ?? []).entries()) {
        items.push({ id: `${message.id}:image:${mediaIndex}`, type: 'image', messageId: message.id, mediaIndex, senderId: message.senderId, time: message.time, title: message.text || `Ảnh ${mediaIndex + 1}`, src });
      }
      continue;
    }
    if (message.kind === 'file') {
      items.push({ id: `${message.id}:file`, type: 'file', messageId: message.id, senderId: message.senderId, time: message.time, title: message.fileName ?? 'Tệp', url: message.fileUrl });
      continue;
    }
    if (message.kind === 'audio') {
      items.push({ id: `${message.id}:audio`, type: 'audio', messageId: message.id, senderId: message.senderId, time: message.time, title: 'Ghi âm thoại', url: message.audioUrl, durationSeconds: message.audioDuration ?? 0 });
      continue;
    }
    if (message.kind === 'text') {
      for (const [index, url] of extractLinks(message.text).entries()) {
        items.push({ id: `${message.id}:link:${index}`, type: 'link', messageId: message.id, senderId: message.senderId, time: message.time, title: url, url });
      }
    }
  }
  return items;
}
