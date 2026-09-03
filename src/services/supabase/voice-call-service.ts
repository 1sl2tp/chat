import type { CallRuntimeEvent, CallService, LiveCallConfiguration, LiveCallStartInput } from '../call.js';
import type { LiveKitAudioTransport, LiveKitCredentials } from '../livekit/livekit-js-audio.js';
import type { SupabasePort } from './port.js';
import { requireData } from './port.js';

export interface ActiveVoiceCallRow {
  id: string;
  conversation_id: string;
  caller_profile_id: string;
  callee_profile_id: string;
  caller_device_id: string;
  accepted_device_id: string | null;
  state: 'ringing' | 'accepted' | 'connecting' | 'connected';
  created_at: string;
  ringing_at: string;
  accepted_at: string | null;
  connecting_at: string | null;
  connected_at: string | null;
  updated_at: string;
  caller_display_name: string | null;
  caller_avatar_url: string | null;
  callee_display_name: string | null;
  callee_avatar_url: string | null;
}

interface ActiveCall {
  callId: string;
  direction: 'outgoing' | 'incoming';
  peerId: string;
  peerName: string;
  peerInitials: string;
  state: ActiveVoiceCallRow['state'];
  joined: boolean;
}

interface RpcStateResult { ok: boolean; reason?: string; call_id?: string; state?: string; }
interface TokenResult { serverUrl: string; participantToken: string; }

export class SupabaseVoiceCallService implements CallService {
  #config: LiveCallConfiguration | null = null;
  #active: ActiveCall | null = null;
  #listeners = new Set<(event: CallRuntimeEvent) => void>();
  #unsubscribe: (() => void) | null = null;
  #lastEventType: CallRuntimeEvent['type'] | null = null;
  #refreshing: Promise<void> | null = null;

  constructor(
    private readonly port: SupabasePort,
    private readonly audio: LiveKitAudioTransport
  ) {}

  configure(input: LiveCallConfiguration): void {
    this.#config = input;
  }

  subscribe(listener: (event: CallRuntimeEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async start(): Promise<void> {
    this.#unsubscribe?.();
    this.#unsubscribe = this.port.subscribeToVoiceCalls(() => { void this.refresh(); });
    await this.refresh();
  }

  async stop(): Promise<void> {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    await this.audio.disconnect();
    this.#active = null;
    this.#lastEventType = null;
  }

  async startOutgoing(input: LiveCallStartInput): Promise<void> {
    const config = this.requireConfig();
    if (this.#active) throw new Error('call already active');
    const result = requireData(await this.port.rpc<RpcStateResult>('chat_start_voice_call', {
      p_conversation_id: input.conversationId,
      p_device_id: config.deviceId
    }), 'start voice call');
    if (!result.ok || !result.call_id) throw new Error(result.reason ?? 'call start failed');
    this.#active = {
      callId: result.call_id,
      direction: 'outgoing',
      peerId: input.peerId,
      peerName: input.peerName,
      peerInitials: input.peerInitials,
      state: 'ringing',
      joined: false
    };
    this.#lastEventType = null;
    this.emitActive('connecting');
    await this.joinActive();
  }

  async acceptIncoming(): Promise<void> {
    const config = this.requireConfig();
    const active = this.requireActive('incoming');
    if (active.state !== 'ringing') return;
    const accepted = requireData(await this.port.rpc<RpcStateResult>('chat_accept_voice_call', {
      p_call_id: active.callId,
      p_device_id: config.deviceId
    }), 'accept voice call');
    if (!accepted.ok) throw new Error(accepted.reason ?? 'call accept failed');
    active.state = 'accepted';
    this.emitActive('connecting');
    await this.joinActive();
    const connecting = requireData(await this.port.rpc<RpcStateResult>('chat_mark_voice_call_connecting', {
      p_call_id: active.callId
    }), 'mark voice call connecting');
    if (connecting.ok) active.state = 'connecting';
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.#active) return;
    await this.audio.setMuted(muted);
  }

  async startAudio(): Promise<void> {
    await this.audio.startAudio();
  }

  async end(): Promise<void> {
    const config = this.requireConfig();
    const active = this.#active;
    if (!active) return;
    if (active.state === 'ringing' && active.direction === 'outgoing') {
      requireData(await this.port.rpc<RpcStateResult>('chat_cancel_voice_call', { p_call_id: active.callId }), 'cancel voice call');
    } else if (active.state === 'ringing' && active.direction === 'incoming') {
      requireData(await this.port.rpc<RpcStateResult>('chat_decline_voice_call', {
        p_call_id: active.callId,
        p_device_id: config.deviceId
      }), 'decline voice call');
    } else {
      requireData(await this.port.rpc<RpcStateResult>('chat_end_voice_call', {
        p_call_id: active.callId,
        p_reason: 'ended'
      }), 'end voice call');
    }
    await this.finishActive();
  }

  private async refresh(): Promise<void> {
    if (this.#refreshing) return this.#refreshing;
    this.#refreshing = this.refreshNow().finally(() => { this.#refreshing = null; });
    return this.#refreshing;
  }

  private async refreshNow(): Promise<void> {
    const config = this.#config;
    if (!config) return;
    const rows = requireData(await this.port.rpc<ActiveVoiceCallRow[]>('chat_get_active_voice_calls'), 'active voice calls');
    if (this.#active) {
      const row = rows.find((candidate) => candidate.id === this.#active?.callId);
      if (!row) {
        await this.finishActive();
        return;
      }
      this.#active.state = row.state;
      if (row.state === 'accepted' || row.state === 'connecting' || row.state === 'connected') {
        if (this.deviceAuthorized(row, config)) await this.joinActive();
        if (row.state === 'accepted') {
          const result = requireData(await this.port.rpc<RpcStateResult>('chat_mark_voice_call_connecting', { p_call_id: row.id }), 'mark voice call connecting');
          if (result.ok) this.#active.state = 'connecting';
        }
        if (row.state === 'connected') this.emitActive('connected');
        else this.emitActive('connecting');
      }
      return;
    }

    const incoming = rows.find((row) => row.callee_profile_id === config.localProfileId && row.state === 'ringing');
    if (incoming) {
      this.activateFromRow(incoming, config.localProfileId);
      this.emit({
        type: 'incoming',
        peerId: this.#active!.peerId,
        peerName: this.#active!.peerName,
        peerInitials: this.#active!.peerInitials
      });
      return;
    }

    const resumable = rows.find((row) => row.state !== 'ringing' && this.deviceAuthorized(row, config));
    if (resumable) {
      this.activateFromRow(resumable, config.localProfileId);
      this.emitActive(resumable.state === 'connected' ? 'connected' : 'connecting');
      await this.joinActive();
      if (resumable.state === 'accepted') {
        const result = requireData(await this.port.rpc<RpcStateResult>('chat_mark_voice_call_connecting', { p_call_id: resumable.id }), 'mark voice call connecting');
        if (result.ok) this.setActiveState('connecting');
      }
    }
  }

  private activateFromRow(row: ActiveVoiceCallRow, localProfileId: string): void {
    const outgoing = row.caller_profile_id === localProfileId;
    const peerName = (outgoing ? row.callee_display_name : row.caller_display_name)?.trim() || 'Cuộc gọi';
    this.#active = {
      callId: row.id,
      direction: outgoing ? 'outgoing' : 'incoming',
      peerId: outgoing ? row.callee_profile_id : row.caller_profile_id,
      peerName,
      peerInitials: initials(peerName),
      state: row.state,
      joined: false
    };
    this.#lastEventType = null;
  }

  private deviceAuthorized(row: ActiveVoiceCallRow, config: LiveCallConfiguration): boolean {
    if (row.caller_profile_id === config.localProfileId) return row.caller_device_id === config.deviceId;
    if (row.callee_profile_id === config.localProfileId) return row.accepted_device_id === config.deviceId;
    return false;
  }

  private async joinActive(): Promise<void> {
    const config = this.requireConfig();
    const active = this.#active;
    if (!active || active.joined) return;
    const token = requireData(await this.port.functions.invoke<TokenResult>('taphoa-livekit-token', {
      callId: active.callId,
      deviceId: config.deviceId
    }), 'LiveKit token');
    validateToken(token);
    active.joined = true;
    try {
      await this.audio.join({ serverUrl: token.serverUrl, participantToken: token.participantToken }, {
        onRemoteAudio: () => { void this.markConnectedFromMedia(); },
        onDisconnected: () => { void this.refresh(); }
      });
    } catch (error) {
      active.joined = false;
      throw error;
    }
  }

  private async markConnectedFromMedia(): Promise<void> {
    const active = this.#active;
    if (!active || active.state === 'connected') return;
    const result = requireData(await this.port.rpc<RpcStateResult>('chat_mark_voice_call_connected', {
      p_call_id: active.callId
    }), 'mark voice call connected');
    if (!result.ok) return;
    active.state = 'connected';
    this.emitActive('connected');
  }

  private async finishActive(): Promise<void> {
    await this.audio.disconnect();
    if (this.#active) this.emit({ type: 'ended' });
    this.#active = null;
    this.#lastEventType = null;
  }

  private emitActive(type: 'connecting' | 'connected'): void {
    const active = this.#active;
    if (!active) return;
    this.emit({
      type,
      peerId: active.peerId,
      peerName: active.peerName,
      peerInitials: active.peerInitials,
      direction: active.direction
    });
  }

  private emit(event: CallRuntimeEvent): void {
    if (event.type !== 'incoming' && this.#lastEventType === event.type) return;
    this.#lastEventType = event.type;
    for (const listener of this.#listeners) listener(event);
  }

  private setActiveState(state: ActiveCall['state']): void {
    const active = this.#active as ActiveCall | null;
    if (active) active.state = state;
  }

  private requireConfig(): LiveCallConfiguration {
    if (!this.#config) throw new Error('call service not configured');
    return this.#config;
  }

  private requireActive(direction: ActiveCall['direction']): ActiveCall {
    if (!this.#active || this.#active.direction !== direction) throw new Error(`${direction} call required`);
    return this.#active;
  }
}

function validateToken(value: TokenResult): asserts value is LiveKitCredentials {
  if (!value.serverUrl || !value.participantToken) throw new Error('LiveKit token: invalid response');
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'CG';
}
