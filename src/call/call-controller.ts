import type { Store } from '../app/store.js';
import type { CallState, ChatMessage, Contact } from '../app/types.js';
import type { OverlayManager } from '../app/overlay-manager.js';
import type { AppShell } from '../app/shell.js';
import type { CallRuntimeEvent, CallService, LiveCallConfiguration } from '../services/call.js';
import type { NotificationQueue } from '../services/notifications.js';
import { icon } from '../ui/icons.js';
import { createId } from '../utils/id.js';
import { createFullCall } from './call-full.js';
import { createIncomingCall, createMiniCall } from './call-mini.js';

export interface CallViewModel {
  status: string;
  showDuration: boolean;
}

export interface CallControllerCallbacks {
  localParticipantId: () => string;
  onHistoryEvent: (peerId: string, message: ChatMessage) => void;
  onError?: (error: Error) => void;
}

export function callViewModel(state: CallState): CallViewModel {
  if (state.phase === 'ringing') return { status: 'Cuộc gọi đến', showDuration: false };
  if (state.phase === 'connecting') return { status: 'Đang gọi…', showDuration: false };
  if (state.phase === 'connected') return { status: 'Đang trong cuộc gọi', showDuration: true };
  if (state.phase === 'ended') return { status: 'Cuộc gọi đã kết thúc', showDuration: false };
  return { status: '', showDuration: false };
}

export function formatCallDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export class CallController {
  #timer: number | null = null;
  #connectTimer: number | null = null;
  #service: CallService | null = null;
  #unsubscribeService: (() => void) | null = null;
  #conversationIdFor: ((peerId: string) => string | null) | null = null;

  constructor(
    private readonly store: Store,
    private readonly overlays: OverlayManager,
    private readonly shell: AppShell,
    private readonly notifications: NotificationQueue,
    private readonly callbacks?: CallControllerCallbacks
  ) {}

  bindService(
    service: CallService | null,
    config?: LiveCallConfiguration,
    conversationIdFor?: (peerId: string) => string | null
  ): void {
    this.#unsubscribeService?.();
    this.#unsubscribeService = null;
    if (this.#service && this.#service !== service) void this.#service.stop();
    this.#service = service;
    this.#conversationIdFor = service ? (conversationIdFor ?? null) : null;
    if (!service) return;
    if (!config || !this.#conversationIdFor) throw new Error('live call binding requires session and conversation resolver');
    service.configure(config);
    this.#unsubscribeService = service.subscribe((event) => this.handleServiceEvent(event));
    void service.start().catch((error) => this.reportError(error));
  }

  startOutgoing(peer: Contact): void {
    this.clearTimers();
    if (this.#service) void this.#service.startAudio().catch((error) => this.reportError(error));
    this.paintOutgoing(peer);
    if (this.#service) {
      const conversationId = this.#conversationIdFor?.(peer.id);
      if (!conversationId) {
        this.failLiveStart(new Error('Không tìm thấy cuộc trò chuyện cho cuộc gọi'));
        return;
      }
      void this.#service.startOutgoing({
        conversationId,
        peerId: peer.id,
        peerName: peer.name,
        peerInitials: peer.initials
      }).catch((error) => this.failLiveStart(error));
      return;
    }
    this.#connectTimer = window.setTimeout(() => this.connect(), 1200);
  }

  startIncoming(peer: Contact): void {
    this.clearTimers();
    Object.assign(this.store.state.call, {
      phase: 'ringing', direction: 'incoming', peerId: peer.id, peerName: peer.name, peerInitials: peer.initials,
      muted: false, minimized: true, startedAt: null, initiatedAt: Date.now()
    });
    this.notifications.setBlocked(true);
    this.overlays.removePersistent('full-call');
    this.shell.setTopStatus(createIncomingCall(this.store.state.call, () => this.acceptIncoming(), () => this.end()));
  }

  acceptIncoming(): void {
    if (this.store.state.call.phase !== 'ringing') return;
    if (this.#service) {
      void this.#service.startAudio().catch((error) => this.reportError(error));
      this.store.state.call.phase = 'connecting';
      this.store.state.call.minimized = false;
      this.shell.setTopStatus(null);
      this.renderFull(true);
      void this.#service.acceptIncoming().catch((error) => this.reportError(error));
      return;
    }
    this.store.state.call.phase = 'connected';
    this.store.state.call.minimized = false;
    this.store.state.call.startedAt = Date.now();
    this.shell.setTopStatus(null);
    this.renderFull(true);
    this.startTimer();
  }

  minimize(): void {
    const call = this.store.state.call;
    if (call.phase !== 'connecting' && call.phase !== 'connected') return;
    call.minimized = true;
    this.overlays.removePersistent('full-call');
    this.shell.setTopStatus(createMiniCall(call, () => this.restore(), () => this.end()));
    this.paintTimerNodes();
  }

  restore(): void {
    const call = this.store.state.call;
    if (call.phase !== 'connecting' && call.phase !== 'connected') return;
    call.minimized = false;
    this.shell.setTopStatus(null);
    this.renderFull(true);
    this.paintTimerNodes();
    if (this.#service) void this.#service.startAudio().catch((error) => this.reportError(error));
  }

  toggleMute(): void {
    const call = this.store.state.call;
    if (call.phase !== 'connecting' && call.phase !== 'connected') return;
    call.muted = !call.muted;
    this.paintMute();
    if (this.#service) {
      const next = call.muted;
      void this.#service.setMuted(next).catch((error) => {
        if (this.store.state.call.muted === next) {
          this.store.state.call.muted = !next;
          this.paintMute();
        }
        this.reportError(error);
      });
    }
  }

  end(): void {
    const call = this.store.state.call;
    if (call.phase === 'idle' || call.phase === 'ended') return;
    const event = this.#service ? null : this.createHistoryEvent(call);
    if (this.#service) {
      void this.#service.end().catch((error) => this.reportError(error));
      return;
    }
    this.finishUi(event);
  }

  isActive(): boolean {
    return this.store.state.call.phase !== 'idle' && this.store.state.call.phase !== 'ended';
  }

  private paintOutgoing(peer: Contact): void {
    Object.assign(this.store.state.call, {
      phase: 'connecting', direction: 'outgoing', peerId: peer.id, peerName: peer.name, peerInitials: peer.initials,
      muted: false, minimized: false, startedAt: null, initiatedAt: Date.now()
    });
    this.notifications.setBlocked(true);
    this.renderFull(true);
  }

  private handleServiceEvent(event: CallRuntimeEvent): void {
    if (event.type === 'incoming') {
      this.startIncoming(runtimePeer(event));
      return;
    }
    if (event.type === 'ended') {
      if (this.store.state.call.phase !== 'idle' && this.store.state.call.phase !== 'ended') this.finishUi(null);
      return;
    }
    this.hydrateFromRuntimeEvent(event);
    if (event.type === 'connecting') {
      if (this.store.state.call.phase === 'idle' || this.store.state.call.phase === 'ended') return;
      this.store.state.call.phase = 'connecting';
      this.store.state.call.startedAt = null;
      this.paintPhase();
      return;
    }
    if (this.store.state.call.phase === 'idle' || this.store.state.call.phase === 'ended') return;
    this.store.state.call.phase = 'connected';
    this.store.state.call.startedAt ??= Date.now();
    this.paintPhase();
    this.startTimer();
  }

  private hydrateFromRuntimeEvent(event: Extract<CallRuntimeEvent, { type: 'connecting' | 'connected' }>): void {
    if (!event.peerId || !event.peerName || !event.peerInitials || !event.direction) return;
    const call = this.store.state.call;
    if (call.phase !== 'idle' && call.phase !== 'ended') return;
    Object.assign(call, {
      phase: event.type,
      direction: event.direction,
      peerId: event.peerId,
      peerName: event.peerName,
      peerInitials: event.peerInitials,
      muted: false,
      minimized: false,
      startedAt: event.type === 'connected' ? Date.now() : null,
      initiatedAt: Date.now()
    });
    this.notifications.setBlocked(true);
    this.shell.setTopStatus(null);
    this.renderFull(false);
  }

  private connect(): void {
    const call = this.store.state.call;
    if (call.phase !== 'connecting') return;
    call.phase = 'connected';
    call.startedAt = Date.now();
    this.paintPhase();
    this.startTimer();
  }

  private createHistoryEvent(call: CallState): ChatMessage | null {
    if (!this.callbacks || !call.peerId) return null;
    const localId = this.callbacks.localParticipantId();
    const callerId = call.direction === 'outgoing' ? localId : call.peerId;
    const calleeId = call.direction === 'outgoing' ? call.peerId : localId;
    const wasConnected = call.phase === 'connected';
    const outcome = wasConnected ? 'completed' : call.direction === 'outgoing' ? 'cancelled' : 'unanswered';
    const durationSeconds = wasConnected && call.startedAt ? Math.max(1, Math.floor((Date.now() - call.startedAt) / 1000)) : undefined;
    return {
      id: createId('call'),
      senderId: callerId,
      recipientId: calleeId,
      kind: 'call',
      time: new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
      call: { callerId, calleeId, outcome, durationSeconds }
    };
  }

  private finishUi(event: ChatMessage | null): void {
    const call = this.store.state.call;
    this.clearTimers();
    call.phase = 'ended';
    call.minimized = false;
    call.startedAt = null;
    this.overlays.removePersistent('full-call');
    if (event && call.peerId) this.callbacks?.onHistoryEvent(call.peerId, event);

    const status = document.createElement('div');
    status.className = 'status-card';
    status.innerHTML = `<span class="avatar s">${escapeHtml(call.peerInitials || '✓')}</span><span class="status-copy"><strong>Cuộc gọi đã kết thúc</strong><small>${escapeHtml(call.peerName)}</small></span>`;
    this.shell.setTopStatus(status);
    window.setTimeout(() => {
      if (this.store.state.call.phase !== 'ended') return;
      Object.assign(this.store.state.call, { phase: 'idle', direction: 'outgoing', peerId: '', peerName: '', peerInitials: '', muted: false, minimized: false, startedAt: null, initiatedAt: null });
      this.shell.setTopStatus(null);
      this.notifications.setBlocked(false);
    }, 850);
  }

  private failLiveStart(error: unknown): void {
    this.clearTimers();
    this.overlays.removePersistent('full-call');
    Object.assign(this.store.state.call, { phase: 'idle', direction: 'outgoing', peerId: '', peerName: '', peerInitials: '', muted: false, minimized: false, startedAt: null, initiatedAt: null });
    this.notifications.setBlocked(false);
    this.reportError(error);
  }

  private reportError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.callbacks?.onError?.(normalized);
  }

  private renderFull(animate: boolean): void {
    const call = this.store.state.call;
    const full = createFullCall(call, { onMinimize: () => this.minimize(), onMute: () => this.toggleMute(), onEnd: () => this.end() }, animate);
    if (this.#service) {
      full.addEventListener('pointerdown', () => {
        void this.#service?.startAudio().catch((error) => this.reportError(error));
      }, { once: true });
    }
    this.overlays.mountPersistent('full-call', full, 'call');
    this.paintTimerNodes();
  }

  private paintMute(): void {
    const call = this.store.state.call;
    document.querySelectorAll<HTMLButtonElement>('[data-call-mic]').forEach((button) => {
      button.innerHTML = `${icon(call.muted ? 'micOff' : 'mic')}<span>${call.muted ? 'Bật mic' : 'Mic'}</span>`;
      button.classList.toggle('muted', call.muted);
    });
    if (call.minimized) this.shell.setTopStatus(createMiniCall(call, () => this.restore(), () => this.end()));
    this.paintTimerNodes();
  }

  private paintPhase(): void {
    const call = this.store.state.call;
    const view = callViewModel(call);
    document.querySelectorAll<HTMLElement>('[data-call-status]').forEach((node) => node.textContent = view.status);
    document.querySelectorAll<HTMLElement>('[data-call-dot]').forEach((node) => node.classList.toggle('online', call.phase === 'connected'));
    document.querySelectorAll<HTMLElement>('[data-call-avatar]').forEach((node) => node.classList.toggle('call-pulse', call.phase === 'connecting'));
    document.querySelectorAll<HTMLElement>('[data-call-duration]').forEach((node) => node.hidden = !view.showDuration);
  }

  private startTimer(): void {
    if (this.#timer !== null) window.clearInterval(this.#timer);
    this.paintTimerNodes();
    this.#timer = window.setInterval(() => this.paintTimerNodes(), 1000);
  }

  private paintTimerNodes(): void {
    const call = this.store.state.call;
    const seconds = call.startedAt ? (Date.now() - call.startedAt) / 1000 : 0;
    const text = formatCallDuration(seconds);
    document.querySelectorAll<HTMLElement>('[data-call-timer]').forEach((node) => node.textContent = text);
  }

  private clearTimers(): void {
    if (this.#timer !== null) window.clearInterval(this.#timer);
    if (this.#connectTimer !== null) window.clearTimeout(this.#connectTimer);
    this.#timer = null;
    this.#connectTimer = null;
  }
}

function runtimePeer(event: Extract<CallRuntimeEvent, { type: 'incoming' }>): Contact {
  return {
    id: event.peerId,
    name: event.peerName,
    initials: event.peerInitials,
    accountType: 'customer',
    customerGroupId: null,
    username: null,
    password: null,
    lastMessage: '',
    lastMessageAt: new Date().toISOString(),
    unread: 0
  };
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char)); }
