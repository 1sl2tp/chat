import type { CallState } from '../app/types.js';
import { icon } from '../ui/icons.js';
import { callViewModel } from './call-controller.js';

export interface FullCallHandlers {
  onMinimize: () => void;
  onMute: () => void;
  onEnd: () => void;
}

export function createFullCall(state: CallState, handlers: FullCallHandlers, animate: boolean): HTMLElement {
  const view = callViewModel(state);
  const root = document.createElement('section');
  root.className = `full-call${animate ? ' enter' : ''}`;
  root.innerHTML = `
    <button class="call-minimize icon-button" type="button" data-call-minimize aria-label="Thu nhỏ">${icon('minimize')}</button>
    <div class="call-person">
      <div class="avatar xl ${state.phase === 'connecting' ? 'call-pulse' : ''}" data-call-avatar>${escapeHtml(state.peerInitials)}</div>
      <strong>${escapeHtml(state.peerName)}</strong>
      <div class="call-status-line"><span class="call-dot ${state.phase === 'connected' ? 'online' : ''}" data-call-dot></span><span data-call-status>${escapeHtml(view.status)}</span><span data-call-duration ${view.showDuration ? '' : 'hidden'}>· <b data-call-timer>00:00</b></span></div>
    </div>
    <div class="call-controls">
      <button class="call-control" data-call-mic type="button">${icon(state.muted ? 'micOff' : 'mic')}<span>${state.muted ? 'Bật mic' : 'Mic'}</span></button>
      <button class="call-end" data-call-end type="button">${icon('callEnd')}<span>Kết thúc</span></button>
    </div>`;
  root.querySelector<HTMLButtonElement>('[data-call-minimize]')?.addEventListener('click', handlers.onMinimize);
  root.querySelector<HTMLButtonElement>('[data-call-mic]')?.addEventListener('click', handlers.onMute);
  root.querySelector<HTMLButtonElement>('[data-call-end]')?.addEventListener('click', handlers.onEnd);
  return root;
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char)); }
