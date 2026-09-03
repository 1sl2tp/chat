import { icon, type IconName } from '../ui/icons.js';

export interface HeaderModel {
  title: string;
  subtitle?: string;
  back?: boolean;
  leadingIcon?: IconName;
  call?: boolean;
  menu?: boolean;
  onBack?: () => void;
  onCall?: () => void;
  onMenu?: (anchor: HTMLButtonElement) => void;
}

export class AppShell {
  readonly root: HTMLElement;
  readonly header: HTMLElement;
  readonly topStatus: HTMLElement;
  readonly screenHost: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    root.className = 'app-shell';
    root.innerHTML = `
      <header class="app-header" data-region="header"></header>
      <section class="top-status-slot" data-region="top-status" hidden></section>
      <main class="screen-host" data-region="screen-host"></main>
    `;
    this.header = root.querySelector<HTMLElement>('[data-region="header"]')!;
    this.topStatus = root.querySelector<HTMLElement>('[data-region="top-status"]')!;
    this.screenHost = root.querySelector<HTMLElement>('[data-region="screen-host"]')!;
  }

  setHeader(model: HeaderModel): void {
    const leading = model.back
      ? `<button class="icon-button" data-header-back aria-label="Quay lại">${icon('back')}</button>`
      : model.leadingIcon
        ? `<span class="header-leading" aria-hidden="true">${icon(model.leadingIcon)}</span>`
        : '<span class="header-spacer" aria-hidden="true"></span>';
    this.header.innerHTML = `
      <div class="header-left">
        ${leading}
        <div class="header-copy"><strong>${escapeHtml(model.title)}</strong>${model.subtitle ? `<small>${escapeHtml(model.subtitle)}</small>` : ''}</div>
      </div>
      <div class="header-actions">
        ${model.call ? `<button class="icon-button" data-header-call aria-label="Gọi">${icon('call')}</button>` : ''}
        ${model.menu ? `<button class="icon-button" data-header-menu aria-label="Menu">${icon('more')}</button>` : ''}
      </div>`;
    this.header.querySelector<HTMLButtonElement>('[data-header-back]')?.addEventListener('click', () => model.onBack?.());
    this.header.querySelector<HTMLButtonElement>('[data-header-call]')?.addEventListener('click', () => model.onCall?.());
    this.header.querySelector<HTMLButtonElement>('[data-header-menu]')?.addEventListener('click', (event) => model.onMenu?.(event.currentTarget as HTMLButtonElement));
  }

  setTopStatus(content: HTMLElement | null): void {
    this.topStatus.replaceChildren();
    if (!content) {
      this.topStatus.hidden = true;
      return;
    }
    this.topStatus.hidden = false;
    this.topStatus.append(content);
  }

  mountScreen(screen: HTMLElement): void {
    this.screenHost.replaceChildren(screen);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char));
}
