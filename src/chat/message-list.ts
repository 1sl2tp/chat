import type { ChatMessage } from '../app/types.js';
import type { OverlayManager } from '../app/overlay-manager.js';
import { icon } from '../ui/icons.js';
import { downloadText, downloadUrl } from '../utils/download.js';
import { callEventView, extractLinks, isOutgoing, latestOutgoingStatusId, messageActionLabels } from './message-contract.js';

export interface MessageListCallbacks {
  onReply: (message: ChatMessage) => void;
  onCallBack?: () => void;
}

export class MessageList {
  readonly root: HTMLElement;
  #messages: ChatMessage[] = [];
  #audioPlayers = new Set<HTMLAudioElement>();
  #outside = (event: PointerEvent): void => {
    const target = event.target as Element | null;
    if (target?.closest('.message-footer')) return;
    this.root.querySelectorAll('.message.actions-open').forEach((node) => node.classList.remove('actions-open'));
  };

  constructor(
    private readonly overlays: OverlayManager,
    private readonly localParticipantId: string,
    private readonly callbacks: MessageListCallbacks
  ) {
    this.root = document.createElement('div');
    this.root.className = 'message-list scroll-owner';
    this.root.dataset.scrollOwner = 'messages';
    document.addEventListener('pointerdown', this.#outside, true);
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.#outside, true);
    this.stopAudioPlayers();
  }

  setMessages(messages: ChatMessage[]): void {
    this.stopAudioPlayers();
    this.#messages = messages;
    this.root.replaceChildren();
    const day = document.createElement('div');
    day.className = 'day-separator';
    day.textContent = 'Hôm nay';
    this.root.append(day);
    const statusOwnerId = latestOutgoingStatusId(messages, this.localParticipantId);
    for (const message of messages) this.root.append(this.renderMessage(message, statusOwnerId));
    requestAnimationFrame(() => this.scrollToBottom(false));
  }

  append(message: ChatMessage): void {
    const statusOwnerId = latestOutgoingStatusId(this.#messages, this.localParticipantId);
    this.root.querySelectorAll<HTMLElement>('[data-message-id]').forEach((row) => {
      const id = row.dataset.messageId ?? '';
      const current = this.#messages.find((item) => item.id === id);
      const meta = row.querySelector<HTMLElement>('[data-message-meta]');
      if (current && meta) meta.innerHTML = this.metaMarkup(current, statusOwnerId);
    });
    this.root.append(this.renderMessage(message, statusOwnerId));
    this.scrollToBottom(true);
  }

  get scrollTop(): number { return this.root.scrollTop; }
  set scrollTop(value: number) { this.root.scrollTop = value; }

  scrollToBottom(smooth = false): void {
    this.root.scrollTo({ top: this.root.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  scrollToMessage(messageId: string, highlight = true): boolean {
    const row = this.root.querySelector<HTMLElement>(`[data-message-id="${cssEscape(messageId)}"]`);
    if (!row) return false;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (highlight) {
      row.classList.remove('message-origin-highlight');
      requestAnimationFrame(() => row.classList.add('message-origin-highlight'));
      window.setTimeout(() => row.classList.remove('message-origin-highlight'), 1300);
    }
    return true;
  }

  renderMessage(message: ChatMessage, statusOwnerId = latestOutgoingStatusId(this.#messages, this.localParticipantId)): HTMLElement {
    if (message.kind === 'system') {
      const system = document.createElement('div');
      system.className = 'message-system';
      system.dataset.messageId = message.id;
      system.textContent = message.text ?? '';
      return system;
    }
    if (message.kind === 'call') return this.renderCallEvent(message);

    const outgoing = isOutgoing(message, this.localParticipantId);
    const row = document.createElement('article');
    row.className = `message ${outgoing ? 'out' : 'in'}`;
    row.dataset.messageId = message.id;

    const envelope = document.createElement('div');
    envelope.className = 'message-envelope';
    envelope.innerHTML = `
      <div class="message-bubble">${this.bodyMarkup(message)}</div>
      <div class="message-footer">
        <span class="message-meta" data-message-meta>${this.metaMarkup(message, statusOwnerId)}</span>
        <span class="message-actions">${this.actionMarkup(message)}</span>
      </div>`;

    const footer = envelope.querySelector<HTMLElement>('.message-footer')!;
    footer.addEventListener('click', (event) => {
      if ((event.target as Element).closest('button')) return;
      row.classList.toggle('actions-open');
    });

    envelope.querySelectorAll<HTMLButtonElement>('[data-message-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        void this.runAction(button.dataset.messageAction ?? '', message);
        row.classList.remove('actions-open');
      });
    });

    envelope.querySelectorAll<HTMLButtonElement>('[data-image-index]').forEach((button) => button.addEventListener('click', () => {
      if (!message.images?.length) return;
      this.overlays.openImageViewer(message.images, Number(button.dataset.imageIndex ?? 0), message.text ?? '');
    }));

    this.bindAudio(envelope, message);
    row.append(envelope);
    return row;
  }

  private renderCallEvent(message: ChatMessage): HTMLElement {
    const view = callEventView(message, this.localParticipantId);
    const row = document.createElement('div');
    row.className = 'call-event';
    row.dataset.messageId = message.id;
    row.innerHTML = `<span class="call-event-icon">${icon('call')}</span><span>${escapeHtml(view.label)}</span>${view.canCallBack ? '<button type="button" data-call-back>Gọi lại</button>' : ''}`;
    row.querySelector<HTMLButtonElement>('[data-call-back]')?.addEventListener('click', () => this.callbacks.onCallBack?.());
    return row;
  }

  private metaMarkup(message: ChatMessage, statusOwnerId: string | null): string {
    let value = escapeHtml(message.time);
    if (message.id !== statusOwnerId || !isOutgoing(message, this.localParticipantId)) return value;
    const status = message.status === 'sending' ? 'Đang gửi…' : message.status === 'sent' ? 'Đã gửi' : message.status === 'seen' ? 'Đã xem' : '';
    if (status) value += ` · ${status}`;
    return value;
  }

  private actionMarkup(message: ChatMessage): string {
    return messageActionLabels(message).map((label) => `<button type="button" data-message-action="${actionKey(label)}">${label}</button>`).join('');
  }

  private bodyMarkup(message: ChatMessage): string {
    if (message.kind === 'image' && message.images?.length) {
      const images = message.images;
      const visible = images.slice(0, 4);
      return `<div class="message-images count-${Math.min(4, visible.length)}">${visible.map((src, index) => `<button type="button" data-image-index="${index}"><img src="${escapeAttr(src)}" alt="Ảnh ${index + 1}" />${index === 3 && images.length > 4 ? `<b>+${images.length - 4}</b>` : ''}</button>`).join('')}</div>${message.text ? `<p class="message-caption">${escapeHtml(message.text)}</p>` : ''}`;
    }
    if (message.kind === 'audio') {
      const duration = message.audioDuration ?? 18;
      return `<div class="audio-card" data-audio data-duration="${duration}"><button class="audio-play" type="button" data-audio-play>${icon('play')}</button><div class="audio-track" data-audio-track><i data-audio-progress></i></div><span data-audio-time>0:00 / ${formatDuration(duration)}</span></div>`;
    }
    if (message.kind === 'file') {
      return `<div class="file-card">${icon('file')}<div><strong>${escapeHtml(message.fileName ?? 'Tệp')}</strong><small>Tệp đính kèm</small></div></div>`;
    }
    const reply = message.replyTo ? `<div class="reply-preview">${escapeHtml(message.replyTo)}</div>` : '';
    return `${reply}<p>${linkify(message.text ?? '')}</p>`;
  }

  private async runAction(action: string, message: ChatMessage): Promise<void> {
    if (action === 'reply') {
      this.callbacks.onReply(message);
      return;
    }
    if (action === 'copy') {
      const value = message.text ?? message.fileName ?? '';
      if (value && navigator.clipboard) await navigator.clipboard.writeText(value).catch(() => undefined);
      return;
    }
    if (action === 'open') {
      const url = extractLinks(message.text)[0];
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (action === 'save') this.saveMessage(message);
  }

  private saveMessage(message: ChatMessage): void {
    if (message.kind === 'image' && message.images?.length) {
      if (message.images.length > 1) {
        this.overlays.openImageViewer(message.images, 0, message.text ?? '');
        return;
      }
      const src = message.images[0];
      if (src) downloadUrl(src, `taphoa-${message.id}.png`);
      return;
    }
    if (message.kind === 'file') {
      if (message.fileUrl) downloadUrl(message.fileUrl, message.fileName ?? `taphoa-${message.id}`);
      else downloadText(`Tệp mẫu: ${message.fileName ?? 'Tệp'}`, message.fileName ?? `taphoa-${message.id}.txt`);
      return;
    }
    if (message.kind === 'audio') {
      if (message.audioUrl) downloadUrl(message.audioUrl, `ghi-am-${message.id}.webm`);
      else downloadText(`Ghi âm thoại · ${formatDuration(message.audioDuration ?? 0)}`, `ghi-am-${message.id}.txt`);
    }
  }

  private bindAudio(envelope: HTMLElement, message: ChatMessage): void {
    const card = envelope.querySelector<HTMLElement>('[data-audio]');
    if (!card) return;
    if (message.audioUrl) {
      this.bindLiveAudio(card, message);
      return;
    }
    const duration = Number(card.dataset.duration ?? message.audioDuration ?? 18);
    let current = 0;
    let timer: number | null = null;
    const play = card.querySelector<HTMLButtonElement>('[data-audio-play]')!;
    const progress = card.querySelector<HTMLElement>('[data-audio-progress]')!;
    const time = card.querySelector<HTMLElement>('[data-audio-time]')!;
    const paint = (): void => {
      progress.style.width = `${Math.min(100, (current / duration) * 100)}%`;
      time.textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
    };
    const stop = (): void => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      play.innerHTML = icon('play');
    };
    play.addEventListener('click', () => {
      if (timer !== null) { stop(); return; }
      play.innerHTML = icon('pause');
      timer = window.setInterval(() => {
        current += 1;
        if (current >= duration) { current = duration; paint(); stop(); return; }
        paint();
      }, 1000);
    });
    card.querySelector<HTMLElement>('[data-audio-track]')?.addEventListener('click', (event) => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      current = Math.round(((event.clientX - rect.left) / rect.width) * duration);
      paint();
    });
  }

  private bindLiveAudio(card: HTMLElement, message: ChatMessage): void {
    if (!message.audioUrl) return;
    const audio = new Audio(message.audioUrl);
    this.#audioPlayers.add(audio);
    const play = card.querySelector<HTMLButtonElement>('[data-audio-play]')!;
    const progress = card.querySelector<HTMLElement>('[data-audio-progress]')!;
    const time = card.querySelector<HTMLElement>('[data-audio-time]')!;
    let duration = Math.max(0, message.audioDuration ?? 0);

    const paint = (): void => {
      const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const knownDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
      if (knownDuration > 0) duration = knownDuration;
      progress.style.width = `${duration > 0 ? Math.min(100, (current / duration) * 100) : 0}%`;
      time.textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
    };
    const paintStopped = (): void => {
      play.innerHTML = icon('play');
      paint();
    };

    audio.addEventListener('loadedmetadata', paint);
    audio.addEventListener('durationchange', paint);
    audio.addEventListener('timeupdate', paint);
    audio.addEventListener('pause', paintStopped);
    audio.addEventListener('ended', paintStopped);
    audio.addEventListener('error', paintStopped);

    play.addEventListener('click', () => {
      if (!audio.paused) { audio.pause(); return; }
      for (const other of this.#audioPlayers) if (other !== audio) other.pause();
      void audio.play().then(() => { play.innerHTML = icon('pause'); }).catch(paintStopped);
    });
    card.querySelector<HTMLElement>('[data-audio-track]')?.addEventListener('click', (event) => {
      if (duration <= 0) return;
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
      audio.currentTime = ratio * duration;
      paint();
    });
    paint();
  }

  private stopAudioPlayers(): void {
    for (const audio of this.#audioPlayers) {
      audio.pause();
      audio.src = '';
    }
    this.#audioPlayers.clear();
  }
}

function actionKey(label: string): string {
  if (label === 'Trả lời') return 'reply';
  if (label === 'Sao chép') return 'copy';
  if (label === 'Lưu') return 'save';
  return 'open';
}

function formatDuration(total: number): string {
  const sec = Math.max(0, Math.floor(total));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function linkify(value: string): string {
  const escaped = escapeHtml(value);
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}
function cssEscape(value: string): string { return value.replace(/["\\]/g, '\\$&'); }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char)); }
function escapeAttr(value: string): string { return escapeHtml(value).replace(/`/g, '&#96;'); }
