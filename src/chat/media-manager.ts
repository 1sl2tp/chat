import type { ChatMessage } from '../app/types.js';
import type { OverlayManager } from '../app/overlay-manager.js';
import { icon } from '../ui/icons.js';
import { downloadText, downloadUrl } from '../utils/download.js';
import { collectConversationMedia, formatCompactDuration, type ConversationMediaItem, type MediaType } from './message-contract.js';

export interface MediaManagerCallbacks {
  onClose: () => void;
  onViewOriginal: (messageId: string) => void;
}

const TAB_LABELS: Array<{ id: MediaType; label: string }> = [
  { id: 'image', label: 'Ảnh' },
  { id: 'file', label: 'Tệp' },
  { id: 'link', label: 'Link' },
  { id: 'audio', label: 'Ghi âm' }
];

export class MediaManager {
  readonly root: HTMLElement;
  #tab: MediaType = 'image';
  #items: ConversationMediaItem[];

  constructor(
    private readonly overlays: OverlayManager,
    private readonly messages: ChatMessage[],
    private readonly localParticipantId: string,
    private readonly peerName: string,
    private readonly callbacks: MediaManagerCallbacks
  ) {
    this.#items = collectConversationMedia(messages);
    this.root = document.createElement('section');
    this.root.className = 'media-manager scroll-owner';
    this.paint();
  }

  private paint(): void {
    const items = this.#items.filter((item) => item.type === this.#tab);
    this.root.innerHTML = `
      <header class="media-manager-header">
        <button class="icon-button" type="button" data-media-close aria-label="Quay lại">${icon('back')}</button>
        <strong>Đa phương tiện</strong>
        <span class="header-spacer" aria-hidden="true"></span>
      </header>
      <nav class="media-tabs">${TAB_LABELS.map((tab) => `<button type="button" data-media-tab="${tab.id}" class="${this.#tab === tab.id ? 'active' : ''}">${tab.label}</button>`).join('')}</nav>
      <div class="media-content ${this.#tab === 'image' ? 'media-image-grid' : 'media-list'}" data-media-content></div>`;

    this.root.querySelector<HTMLButtonElement>('[data-media-close]')?.addEventListener('click', this.callbacks.onClose);
    this.root.querySelectorAll<HTMLButtonElement>('[data-media-tab]').forEach((button) => button.addEventListener('click', () => {
      this.#tab = button.dataset.mediaTab as MediaType;
      this.paint();
    }));

    const content = this.root.querySelector<HTMLElement>('[data-media-content]')!;
    if (!items.length) {
      content.innerHTML = '<div class="media-empty">Chưa có nội dung</div>';
      return;
    }
    content.replaceChildren(...items.map((item) => this.renderItem(item)));
  }

  private renderItem(item: ConversationMediaItem): HTMLElement {
    const node = document.createElement('article');
    node.className = `media-item media-${item.type}`;
    const sender = item.senderId === this.localParticipantId ? 'Bạn' : this.peerName;
    if (item.type === 'image') {
      node.innerHTML = `
        <button class="media-image-thumb" type="button" data-open-media><img src="${escapeAttr(item.src ?? '')}" alt="${escapeAttr(item.title)}" /></button>
        <div class="media-item-meta"><span>${escapeHtml(sender)} · ${escapeHtml(item.time)}</span><span class="media-inline-actions"><button data-save>Lưu</button><button data-origin>Xem gốc</button></span></div>`;
      node.querySelector<HTMLButtonElement>('[data-open-media]')?.addEventListener('click', () => this.openImage(item));
    } else if (item.type === 'file') {
      node.innerHTML = `<div class="media-item-main">${icon('file')}<span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(sender)} · ${escapeHtml(item.time)}</small></span></div><div class="media-inline-actions"><button data-open>Mở</button><button data-save>Lưu</button><button data-origin>Xem gốc</button></div>`;
    } else if (item.type === 'link') {
      node.innerHTML = `<div class="media-item-main">${icon('link')}<span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(sender)} · ${escapeHtml(item.time)}</small></span></div><div class="media-inline-actions"><button data-open>Mở</button><button data-copy>Sao chép</button><button data-origin>Xem gốc</button></div>`;
    } else {
      node.innerHTML = `<div class="media-item-main">${icon('mic')}<span><strong>Ghi âm thoại · ${formatCompactDuration(item.durationSeconds ?? 0)}</strong><small>${escapeHtml(sender)} · ${escapeHtml(item.time)}</small></span></div><div class="media-inline-actions"><button data-play>Phát</button><button data-save>Lưu</button><button data-origin>Xem gốc</button></div>`;
    }

    node.querySelector<HTMLButtonElement>('[data-origin]')?.addEventListener('click', () => this.callbacks.onViewOriginal(item.messageId));
    node.querySelector<HTMLButtonElement>('[data-save]')?.addEventListener('click', () => this.saveItem(item));
    node.querySelector<HTMLButtonElement>('[data-open]')?.addEventListener('click', () => { if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer'); });
    node.querySelector<HTMLButtonElement>('[data-copy]')?.addEventListener('click', async () => { if (item.url && navigator.clipboard) await navigator.clipboard.writeText(item.url).catch(() => undefined); });
    node.querySelector<HTMLButtonElement>('[data-play]')?.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.textContent = button.textContent === 'Phát' ? 'Dừng' : 'Phát';
    });
    return node;
  }

  private openImage(item: ConversationMediaItem): void {
    const message = this.messages.find((candidate) => candidate.id === item.messageId);
    if (!message?.images?.length) return;
    this.overlays.openImageViewer(message.images, item.mediaIndex ?? 0, message.text ?? '');
  }

  private saveItem(item: ConversationMediaItem): void {
    if (item.type === 'image' && item.src) {
      downloadUrl(item.src, `taphoa-${item.messageId}-${(item.mediaIndex ?? 0) + 1}.png`);
      return;
    }
    if (item.type === 'file') {
      if (item.url) downloadUrl(item.url, item.title);
      else downloadText(`Tệp mẫu: ${item.title}`, item.title);
      return;
    }
    if (item.type === 'audio') {
      if (item.url) downloadUrl(item.url, `ghi-am-${item.messageId}.webm`);
      else downloadText(`Ghi âm thoại · ${formatCompactDuration(item.durationSeconds ?? 0)}`, `ghi-am-${item.messageId}.txt`);
    }
  }
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char)); }
function escapeAttr(value: string): string { return escapeHtml(value).replace(/`/g, '&#96;'); }
