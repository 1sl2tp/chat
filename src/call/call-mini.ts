import type { CallState } from '../app/types.js';
import { icon } from '../ui/icons.js';
import { callViewModel } from './call-controller.js';

export function createMiniCall(state: CallState, onRestore: () => void, onEnd: () => void): HTMLElement {
  const view = callViewModel(state);
  const card = document.createElement('div');
  card.className = 'status-card call-mini';
  card.innerHTML = `
    <button class="call-mini-main" type="button" data-restore>
      <span class="avatar s">${escapeHtml(state.peerInitials)}</span>
      <span class="status-copy"><strong>${escapeHtml(state.peerName)}</strong><small><i class="call-dot ${state.phase === 'connected' ? 'online' : ''}"></i>${escapeHtml(view.status)} ${state.muted ? '· Mic tắt' : ''}${view.showDuration ? ' · <b data-call-timer>00:00</b>' : ''}</small></span>
    </button>
    <button class="button danger compact-end" type="button" data-end>${icon('callEnd')}<span>Kết thúc</span></button>`;
  card.querySelector<HTMLButtonElement>('[data-restore]')?.addEventListener('click', onRestore);
  card.querySelector<HTMLButtonElement>('[data-end]')?.addEventListener('click', onEnd);
  return card;
}

export function createIncomingCall(state: CallState, onAccept: () => void, onReject: () => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'status-card incoming-call';
  card.innerHTML = `
    <span class="avatar s">${escapeHtml(state.peerInitials)}</span>
    <span class="status-copy"><strong>${escapeHtml(state.peerName)}</strong><small>Cuộc gọi đến</small></span>
    <button class="button secondary compact-action" data-reject type="button">Từ chối</button>
    <button class="button compact-action" data-accept type="button">Nhận</button>`;
  card.querySelector<HTMLButtonElement>('[data-accept]')?.addEventListener('click', onAccept);
  card.querySelector<HTMLButtonElement>('[data-reject]')?.addEventListener('click', onReject);
  return card;
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char)); }
