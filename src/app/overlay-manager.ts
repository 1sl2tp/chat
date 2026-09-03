import { icon } from '../ui/icons.js';
import { downloadUrl } from '../utils/download.js';
import { createId } from '../utils/id.js';

export interface ConfirmCopy {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export function destructiveConfirmCopy(subject: string): ConfirmCopy {
  return {
    title: `Xóa ${subject}?`,
    message: 'Thao tác này không thể hoàn tác.',
    confirmLabel: 'Xóa',
    cancelLabel: 'Hủy'
  };
}

interface LayerRecord {
  id: string;
  el: HTMLElement;
  dismissible: boolean;
  onClose?: () => void;
}

type DismissibleKind = 'sheet' | 'confirm' | 'viewer' | 'menu';

export class OverlayManager {
  #layers: LayerRecord[] = [];
  #escape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.closeTopDismissible();
  };

  constructor(private readonly root: HTMLElement) {
    document.addEventListener('keydown', this.#escape);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.#escape);
    this.clearAll();
  }

  openSheet(options: { title: string; content: HTMLElement; onClose?: () => void }): string {
    const layer = this.#createLayer('sheet', true, options.onClose);
    const panel = document.createElement('section');
    panel.className = 'sheet-panel scroll-owner';
    panel.innerHTML = `<header class="sheet-header"><strong>${escapeHtml(options.title)}</strong><button class="icon-button" data-close aria-label="Đóng">${icon('close')}</button></header>`;
    panel.append(options.content);
    panel.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', () => this.close(layer.id));
    layer.el.append(panel);
    return layer.id;
  }

  openPopover(anchor: HTMLElement, content: HTMLElement, options: { width?: number; onClose?: () => void } = {}): string {
    const layer = this.#createLayer('menu', true, options.onClose);
    const panel = document.createElement('section');
    panel.className = 'popover-panel';
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(options.width ?? 220, Math.max(180, window.innerWidth - 24));
    panel.style.width = `${width}px`;
    panel.style.top = `${Math.min(window.innerHeight - 12, rect.bottom + 6)}px`;
    panel.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width))}px`;
    panel.append(content);
    layer.el.append(panel);
    return layer.id;
  }

  openConfirm(options: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; onConfirm: () => void; onCancel?: () => void }): string {
    const layer = this.#createLayer('confirm', true, options.onCancel);
    const panel = document.createElement('section');
    panel.className = 'confirm-panel';
    panel.innerHTML = `
      <strong>${escapeHtml(options.title)}</strong>
      <p>${escapeHtml(options.message)}</p>
      <div class="confirm-actions">
        <button class="button secondary" data-cancel>${escapeHtml(options.cancelLabel ?? 'Hủy')}</button>
        <button class="button danger" data-confirm>${escapeHtml(options.confirmLabel ?? 'Xóa')}</button>
      </div>`;
    panel.querySelector<HTMLButtonElement>('[data-cancel]')?.addEventListener('click', () => this.close(layer.id));
    panel.querySelector<HTMLButtonElement>('[data-confirm]')?.addEventListener('click', () => {
      options.onConfirm();
      this.close(layer.id, false);
    });
    layer.el.append(panel);
    return layer.id;
  }

  openImageViewer(items: string[], startIndex = 0, caption = ''): string {
    let index = Math.min(Math.max(0, startIndex), Math.max(0, items.length - 1));
    const layer = this.#createLayer('viewer', true);
    const panel = document.createElement('section');
    panel.className = 'viewer-panel';
    const paint = (): void => {
      const src = items[index] ?? '';
      panel.innerHTML = `
        <button class="viewer-close icon-button" data-close aria-label="Đóng">${icon('close')}</button>
        <div class="viewer-stage">
          ${items.length > 1 ? `<button class="viewer-nav left" data-prev aria-label="Ảnh trước">${icon('chevronLeft')}</button>` : ''}
          <img src="${escapeAttr(src)}" alt="Ảnh ${index + 1}" />
          ${items.length > 1 ? `<button class="viewer-nav right" data-next aria-label="Ảnh sau">${icon('chevronRight')}</button>` : ''}
        </div>
        <div class="viewer-meta"><span>${items.length > 1 ? `${index + 1} / ${items.length}` : ''}${caption ? ` · ${escapeHtml(caption)}` : ''}</span><button type="button" data-save>Lưu</button></div>
        ${items.length > 1 ? `<div class="viewer-thumbs scroll-owner">${items.map((item, i) => `<button data-thumb="${i}" class="${i === index ? 'active' : ''}"><img src="${escapeAttr(item)}" alt="Ảnh ${i + 1}" /></button>`).join('')}</div>` : ''}`;
      panel.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', () => this.close(layer.id));
      panel.querySelector<HTMLButtonElement>('[data-save]')?.addEventListener('click', () => { if (src) downloadUrl(src, `taphoa-anh-${index + 1}.png`); });
      panel.querySelector<HTMLButtonElement>('[data-prev]')?.addEventListener('click', () => { index = (index - 1 + items.length) % items.length; paint(); });
      panel.querySelector<HTMLButtonElement>('[data-next]')?.addEventListener('click', () => { index = (index + 1) % items.length; paint(); });
      panel.querySelectorAll<HTMLButtonElement>('[data-thumb]').forEach((button) => button.addEventListener('click', () => { index = Number(button.dataset.thumb ?? 0); paint(); }));
    };
    paint();
    layer.el.append(panel);
    return layer.id;
  }

  mountPersistent(id: string, content: HTMLElement, kind = 'call'): void {
    this.removePersistent(id);
    const layer = document.createElement('div');
    layer.className = `overlay-layer persistent ${kind}`;
    layer.dataset.overlayId = id;
    layer.append(content);
    this.root.append(layer);
    this.#layers.push({ id, el: layer, dismissible: false });
  }

  removePersistent(id: string): void {
    this.close(id, false);
  }

  closeTopDismissible(): boolean {
    for (let i = this.#layers.length - 1; i >= 0; i -= 1) {
      const layer = this.#layers[i];
      if (layer?.dismissible) {
        this.close(layer.id);
        return true;
      }
    }
    return false;
  }

  close(id: string, invokeClose = true): void {
    const index = this.#layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    const [layer] = this.#layers.splice(index, 1);
    layer?.el.remove();
    if (invokeClose) layer?.onClose?.();
  }

  clearAll(): void {
    for (const layer of [...this.#layers]) this.close(layer.id, false);
  }

  #createLayer(kind: DismissibleKind, dismissible: boolean, onClose?: () => void): LayerRecord {
    const id = createId(kind);
    const el = document.createElement('div');
    el.className = `overlay-layer ${kind}`;
    el.dataset.overlayId = id;
    if (dismissible) {
      el.addEventListener('pointerdown', (event) => {
        if (event.target === el) this.close(id);
      });
    }
    this.root.append(el);
    const record = { id, el, dismissible, onClose } satisfies LayerRecord;
    this.#layers.push(record);
    return record;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char));
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
