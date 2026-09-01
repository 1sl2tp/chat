import type { SupabaseClient } from '@supabase/supabase-js'
import { sendIncomingCallPush } from '../notifications/call-push-send'
import { CallAlertController } from './call-alert-controller'
import { fetchLiveKitCredentials, warmLiveKitTokenFunction } from './livekit-credentials'
import { LiveKitVoiceMedia } from './livekit-media'
import {
  diagnosticPhaseForEvent,
  type CallMediaDiagnosticEvent,
  type CallMediaDiagnosticPhase,
} from './media-diagnostic-phase'
import { microphonePermissionNotice } from './microphone-permission'

export type VoiceCallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'reconnecting' | 'active' | 'error'
export type VoiceCallDisplay = 'full' | 'compact' | 'hidden'
export type VoiceCallDirection = 'outgoing' | 'incoming' | null

export interface VoiceCallContext {
  profileId: string
  deviceId: string
  conversationId: string | null
  peerName: string
}

export interface VoiceCallState {
  phase: VoiceCallPhase
  display: VoiceCallDisplay
  direction: VoiceCallDirection
  callId: string | null
  peerName: string
  muted: boolean
  speakerAvailable: boolean
  speakerSelected: boolean
  audioBlocked: boolean
  permissionNotice: string | null
  connectedAt: number | null
  error: string | null
}

type ActiveCallRow = {
  id: string
  conversation_id: string
  caller_profile_id: string
  callee_profile_id: string
  state: string
  connected_at: string | null
  caller_display_name: string | null
  callee_display_name: string | null
}

type CallStateResult = {
  ok?: boolean
  state?: string
  reason?: string
}

const DEFAULT_STATE: VoiceCallState = {
  phase: 'idle',
  display: 'full',
  direction: null,
  callId: null,
  peerName: '',
  muted: false,
  speakerAvailable: false,
  speakerSelected: false,
  audioBlocked: false,
  permissionNotice: null,
  connectedAt: null,
  error: null,
}

export function callErrorMessage(reason: string): string {
  if (reason === 'caller_busy') return 'Bạn đang có cuộc gọi khác'
  if (reason === 'peer_busy') return 'Đối phương đang trong cuộc gọi'
  if (reason === 'call_already_active') return 'Cuộc gọi đã tồn tại'
  return reason
}

export class VoiceCallSession {
  private state: VoiceCallState = { ...DEFAULT_STATE }
  private readonly listeners = new Set<(state: VoiceCallState) => void>()
  private readonly client: SupabaseClient
  private readonly getContext: () => VoiceCallContext | null
  private readonly media: LiveKitVoiceMedia
  private readonly alerts = new CallAlertController()
  private activeTimer: number | null = null
  private backendState: string | null = null
  private started = false
  private markingConnected = false
  private decliningCallId: string | null = null

  constructor(client: SupabaseClient, getContext: () => VoiceCallContext | null) {
    this.client = client
    this.getContext = getContext
    this.media = new LiveKitVoiceMedia({
      onPeerConnected: () => void this.handlePeerConnected(),
      onPeerDisconnected: () => this.handlePeerDisconnected(),
      onReconnecting: () => this.handleMediaReconnecting(),
      onReconnected: () => this.handleMediaReconnected(),
      onRemoteAudioSubscribed: () => {
        void this.reportMediaEvent('remote_audio_subscribed')
      },
      onRemoteAudioPlaying: () => {
        this.publish({ audioBlocked: false, error: null })
        void this.reportMediaEvent('remote_audio_playing')
      },
      onAudioPlaybackBlocked: () => {
        this.publish({ audioBlocked: true })
        void this.reportMediaEvent('remote_audio_blocked')
      },
      onMicrophonePermissionState: (state) => {
        this.publish({ permissionNotice: microphonePermissionNotice(state, navigator.userAgent) })
      },
      onError: (error) => this.fail(error),
    })
  }

  getState(): VoiceCallState {
    return this.state
  }

  hasPhoneSpeakerToggle(): boolean {
    return this.media.canTogglePhoneSpeaker()
  }

  prepareAlertAudioFromUserGesture(): void {
    // Use only on a non-call gesture (for example enabling notifications), or
    // after beginUserGesture() on a call gesture. This keeps iPhone microphone
    // capture as the first media operation for Call/Answer.
    this.alerts.armAfterMicrophoneGesture()
  }

  subscribe(listener: (state: VoiceCallState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.started) return
    this.started = true
    void warmLiveKitTokenFunction(this.client)
    void this.pollActiveCalls()
    this.activeTimer = window.setInterval(() => void this.pollActiveCalls(), 1000)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('pageshow', this.handlePageShow)
  }

  dispose(): void {
    this.started = false
    if (this.activeTimer !== null) window.clearInterval(this.activeTimer)
    this.activeTimer = null
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('pageshow', this.handlePageShow)
    this.alerts.stop()
    this.media.disconnect()
    this.listeners.clear()
  }

  setDisplay(display: VoiceCallDisplay): void {
    if (this.state.phase === 'idle') return
    this.publish({ display })
  }

  dismissError(): void {
    if (this.state.phase !== 'error') return
    this.resetToIdle()
  }

  async startOutgoing(): Promise<void> {
    const context = this.getContext()
    if (!context?.conversationId || !context.deviceId || this.state.phase !== 'idle') return

    this.media.beginUserGesture()
    this.alerts.armAfterMicrophoneGesture()
    this.publish({
      phase: 'outgoing',
      display: 'full',
      direction: 'outgoing',
      peerName: context.peerName || 'Admin',
      audioBlocked: false,
      permissionNotice: null,
      error: null,
    })

    try {
      const result = await this.client.rpc('chat_start_voice_call', {
        p_conversation_id: context.conversationId,
        p_device_id: context.deviceId,
      })
      if (result.error) throw result.error
      const payload = result.data as { ok?: boolean; call_id?: string; state?: string; reason?: string } | null
      if (payload?.ok === false) throw new Error(payload.reason || 'call_start_failed')
      if (!payload?.call_id) throw new Error(payload?.reason || 'call_start_failed')

      this.backendState = payload.state ?? 'ringing'
      this.publish({ callId: payload.call_id })
      void sendIncomingCallPush(this.client, payload.call_id).catch(() => undefined)
      await this.joinLiveKit(payload.call_id, context)
    } catch (error) {
      this.fail(error)
    }
  }

  async accept(): Promise<void> {
    const context = this.getContext()
    const callId = this.state.callId
    if (!context || !callId || this.state.phase !== 'incoming') return

    // Keep getUserMedia as the first media operation on the answer gesture.
    this.media.beginUserGesture()
    // The incoming ringtone/vibration must stop at the user's tap, not after the
    // network round-trip that accepts the call.
    this.publish({ phase: 'connecting', display: 'full', audioBlocked: false, error: null })
    this.alerts.armAfterMicrophoneGesture()
    try {
      const result = await this.client.rpc('chat_accept_voice_call', {
        p_call_id: callId,
        p_device_id: context.deviceId,
      })
      if (result.error) throw result.error
      const payload = result.data as { ok?: boolean; reason?: string } | null
      if (payload?.ok === false) throw new Error(payload.reason || 'call_accept_failed')

      this.backendState = 'accepted'
      await this.joinLiveKit(callId, context)
    } catch (error) {
      this.fail(error)
    }
  }

  async decline(): Promise<void> {
    const context = this.getContext()
    const callId = this.state.callId
    if (!context || !callId) return

    // Close the incoming UI and stop alerting immediately. Suppress rediscovery
    // of the same ringing call while the decline RPC is in flight.
    this.resetToIdle()
    this.decliningCallId = callId
    try {
      const result = await this.client.rpc('chat_decline_voice_call', {
        p_call_id: callId,
        p_device_id: context.deviceId,
      })
      if (result.error) throw result.error
    } finally {
      this.decliningCallId = null
    }
  }

  async hangup(): Promise<void> {
    const context = this.getContext()
    const callId = this.state.callId
    if (!context || !callId) {
      this.resetToIdle()
      return
    }

    try {
      await this.reportMediaEvent('leave')
      if (this.state.phase === 'incoming' && this.backendState === 'ringing') {
        await this.client.rpc('chat_decline_voice_call', {
          p_call_id: callId,
          p_device_id: context.deviceId,
        })
      } else if (this.state.direction === 'outgoing' && this.backendState === 'ringing') {
        await this.client.rpc('chat_cancel_voice_call', { p_call_id: callId })
      } else {
        await this.client.rpc('chat_end_voice_call', { p_call_id: callId, p_reason: 'ended' })
      }
    } finally {
      this.resetToIdle()
    }
  }

  toggleMute(): void {
    const muted = !this.state.muted
    this.publish({ muted })
    const event: CallMediaDiagnosticEvent = muted ? 'mute_on' : 'mute_off'
    void this.media.setMuted(muted)
      .then(() => this.reportMediaEvent(event))
      .catch((error) => {
        this.publish({ muted: !muted, error: error instanceof Error ? error.message : String(error) })
      })
  }

  async chooseSpeaker(): Promise<void> {
    try {
      if (this.media.canTogglePhoneSpeaker()) {
        const nextSpeaker = !this.state.speakerSelected
        const changed = await this.media.setSpeakerEnabled(nextSpeaker)
        if (!changed) {
          this.publish({ speakerAvailable: false, error: 'Không đổi được loa trên thiết bị này' })
          await this.reportMediaEvent('audio_output_unavailable')
          return
        }

        this.publish({ speakerAvailable: true, speakerSelected: nextSpeaker, error: null })
        await this.reportMediaEvent('audio_output_selected', {
          route: nextSpeaker ? 'speaker' : 'receiver',
        })
        return
      }

      const selected = await this.media.chooseAudioOutput()
      this.publish({ speakerAvailable: this.media.canChooseAudioOutput(), speakerSelected: selected, error: null })
      await this.reportMediaEvent(selected ? 'audio_output_selected' : 'audio_output_unavailable')
    } catch (error) {
      this.publish({ speakerSelected: this.media.defaultSpeakerSelected(), error: error instanceof Error ? error.message : String(error) })
    }
  }

  startAudio(): void {
    void this.media.startAudio()
      .then(() => this.publish({ audioBlocked: false }))
      .catch((error) => this.publish({ error: error instanceof Error ? error.message : String(error) }))
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') void this.handleForeground()
  }

  private readonly handlePageShow = (): void => {
    void this.handleForeground()
  }

  private publish(patch: Partial<VoiceCallState>): void {
    this.state = { ...this.state, ...patch }
    this.alerts.sync(this.state)
    for (const listener of this.listeners) listener(this.state)
  }

  private async handleForeground(): Promise<void> {
    await this.pollActiveCalls()
    if (!['active', 'connecting', 'reconnecting'].includes(this.state.phase)) return

    try {
      await this.media.resumeAfterForeground()
    } catch {
      this.publish({ audioBlocked: true })
      await this.reportMediaEvent('remote_audio_blocked')
    }
  }

  private async pollActiveCalls(): Promise<void> {
    const context = this.getContext()
    if (!context?.profileId) return

    const result = await this.client.rpc('chat_get_active_voice_calls')
    if (result.error) {
      if (this.state.phase !== 'idle') this.publish({ error: result.error.message })
      return
    }

    const rows = (result.data ?? []) as ActiveCallRow[]
    const current = this.state.callId ? rows.find((row) => row.id === this.state.callId) : undefined

    if (!this.state.callId) {
      const incoming = rows.find((row) => row.id !== this.decliningCallId && row.callee_profile_id === context.profileId && row.state === 'ringing')
      if (incoming) {
        void warmLiveKitTokenFunction(this.client)
        this.backendState = incoming.state
        this.publish({
          phase: 'incoming',
          display: 'full',
          direction: 'incoming',
          callId: incoming.id,
          peerName: incoming.caller_display_name || 'Người gọi',
          connectedAt: null,
          audioBlocked: false,
          permissionNotice: null,
          error: null,
        })
      }
      return
    }

    if (!current) {
      this.resetToIdle()
      return
    }

    this.backendState = current.state
    const peerName = this.state.direction === 'incoming'
      ? current.caller_display_name || this.state.peerName
      : current.callee_display_name || this.state.peerName
    const reconnecting = this.state.phase === 'reconnecting'

    if (current.state === 'connected') {
      this.publish({
        phase: reconnecting ? 'reconnecting' : 'active',
        peerName,
        connectedAt: current.connected_at ? new Date(current.connected_at).getTime() : this.state.connectedAt ?? Date.now(),
      })
    } else if (current.state === 'accepted' || current.state === 'connecting') {
      this.publish({ phase: reconnecting ? 'reconnecting' : 'connecting', peerName })
    } else {
      this.publish({ peerName })
    }
  }

  private async joinLiveKit(callId: string, context: VoiceCallContext): Promise<void> {
    this.publish({ phase: this.backendState === 'ringing' ? this.state.phase : 'connecting' })
    const credentials = await fetchLiveKitCredentials(this.client, callId, context.deviceId)
    await this.media.join(credentials)
    this.publish({
      speakerAvailable: this.media.canTogglePhoneSpeaker() || this.media.canChooseAudioOutput(),
      speakerSelected: this.media.defaultSpeakerSelected(),
    })
    await this.reportMediaEvent('joined', {
      room: `taphoa-call-${callId.toLowerCase()}`,
      ...this.media.microphoneProcessingDiagnostics(),
    })
  }

  private async handlePeerConnected(): Promise<void> {
    const callId = this.state.callId
    if (!callId || this.markingConnected) return
    this.markingConnected = true
    try {
      const connectingResult = await this.client.rpc('chat_mark_voice_call_connecting', { p_call_id: callId })
      if (connectingResult.error) throw connectingResult.error
      const connectingPayload = connectingResult.data as CallStateResult | null
      if (connectingPayload?.ok === false && connectingPayload.state !== 'connected') {
        throw new Error(connectingPayload.reason || 'call_connecting_failed')
      }

      const connectedResult = await this.client.rpc('chat_mark_voice_call_connected', { p_call_id: callId })
      if (connectedResult.error) throw connectedResult.error
      const connectedPayload = connectedResult.data as CallStateResult | null
      if (connectedPayload?.ok === false) {
        throw new Error(connectedPayload.reason || 'call_connected_failed')
      }

      this.backendState = 'connected'
      this.publish({ phase: 'active', connectedAt: this.state.connectedAt ?? Date.now(), error: null })
      await this.reportMediaEvent('peer_connected')
    } catch (error) {
      this.publish({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      this.markingConnected = false
    }
  }

  private handlePeerDisconnected(): void {
    if (this.state.phase === 'active') this.publish({ phase: 'connecting' })
  }

  private handleMediaReconnecting(): void {
    if (this.state.phase === 'active' || this.state.phase === 'connecting') {
      this.publish({ phase: 'reconnecting' })
    }
  }

  private handleMediaReconnected(): void {
    if (this.state.phase !== 'reconnecting') return
    this.publish({
      phase: this.backendState === 'connected' ? 'active' : 'connecting',
      error: null,
    })
  }

  private async reportMediaEvent(
    event: CallMediaDiagnosticEvent,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.reportMediaState(diagnosticPhaseForEvent(event), {
      reason: event,
      media: 'livekit',
      ...extra,
    })
  }

  private async reportMediaState(
    phase: CallMediaDiagnosticPhase,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const context = this.getContext()
    const callId = this.state.callId
    if (!context?.deviceId || !callId) return
    try {
      await this.client.rpc('chat_report_voice_media_state', {
        p_call_id: callId,
        p_device_id: context.deviceId,
        p_phase: phase,
        p_payload: payload,
      })
    } catch {
      // Diagnostics must never block the call path.
    }
  }

  private resetToIdle(): void {
    this.alerts.stop()
    this.media.disconnect()
    this.backendState = null
    this.markingConnected = false
    this.state = { ...DEFAULT_STATE }
    for (const listener of this.listeners) listener(this.state)
  }

  private fail(error: unknown): void {
    this.alerts.stop()
    this.media.disconnect()
    const reason = error instanceof Error ? error.message : String(error)
    this.publish({ phase: 'error', error: callErrorMessage(reason) })
  }
}