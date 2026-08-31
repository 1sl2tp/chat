import type { SupabaseClient } from '@supabase/supabase-js'
import { collectCallMediaDiagnostics } from './diagnostics'
import { fetchCallIceServers } from './ice-config'

export type VoiceCallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'error'
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

type SignalRow = {
  id: number
  sender_profile_id: string
  kind: 'offer' | 'answer' | 'ice'
  payload: unknown
}

type SelectAudioOutputCapable = MediaDevices & {
  selectAudioOutput?: () => Promise<MediaDeviceInfo>
}

type SinkCapableAudio = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>
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
  connectedAt: null,
  error: null,
}

export class VoiceCallSession {
  private state: VoiceCallState = { ...DEFAULT_STATE }
  private readonly listeners = new Set<(state: VoiceCallState) => void>()
  private readonly client: SupabaseClient
  private readonly getContext: () => VoiceCallContext | null
  private activeTimer: number | null = null
  private signalTimer: number | null = null
  private diagnosticsTimer: number | null = null
  private peer: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteAudio: SinkCapableAudio | null = null
  private iceServers: RTCIceServer[] | null = null
  private lastSignalId = 0
  private pendingIce: RTCIceCandidateInit[] = []
  private backendState: string | null = null
  private started = false

  constructor(client: SupabaseClient, getContext: () => VoiceCallContext | null) {
    this.client = client
    this.getContext = getContext
  }

  getState(): VoiceCallState {
    return this.state
  }

  subscribe(listener: (state: VoiceCallState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.started) return
    this.started = true
    void this.pollActiveCalls()
    this.activeTimer = window.setInterval(() => void this.pollActiveCalls(), 1000)
  }

  dispose(): void {
    this.started = false
    if (this.activeTimer !== null) window.clearInterval(this.activeTimer)
    this.activeTimer = null
    this.cleanupMedia()
    this.listeners.clear()
  }

  setDisplay(display: VoiceCallDisplay): void {
    if (this.state.phase === 'idle') return
    this.publish({ display })
  }

  async startOutgoing(): Promise<void> {
    const context = this.getContext()
    if (!context?.conversationId || !context.deviceId || this.state.phase !== 'idle') return

    this.publish({
      phase: 'outgoing',
      display: 'full',
      direction: 'outgoing',
      peerName: context.peerName || 'Admin',
      error: null,
    })

    try {
      await this.ensureLocalAudio()
      await this.ensureIceServers()
      const result = await this.client.rpc('chat_start_voice_call', {
        p_conversation_id: context.conversationId,
        p_device_id: context.deviceId,
      })
      if (result.error) throw result.error
      const payload = result.data as { ok?: boolean; call_id?: string; state?: string; reason?: string } | null
      if (!payload?.call_id) throw new Error(payload?.reason || 'call_start_failed')
      this.backendState = payload.state ?? 'ringing'
      this.publish({ callId: payload.call_id })
      await this.createPeer(true)
    } catch (error) {
      this.fail(error)
    }
  }

  async accept(): Promise<void> {
    const context = this.getContext()
    const callId = this.state.callId
    if (!context || !callId || this.state.phase !== 'incoming') return

    try {
      await this.ensureLocalAudio()
      await this.ensureIceServers()
      const result = await this.client.rpc('chat_accept_voice_call', {
        p_call_id: callId,
        p_device_id: context.deviceId,
      })
      if (result.error) throw result.error
      const payload = result.data as { ok?: boolean; reason?: string } | null
      if (payload?.ok === false) throw new Error(payload.reason || 'call_accept_failed')
      this.backendState = 'accepted'
      this.publish({ phase: 'connecting', display: 'full', error: null })
      await this.createPeer(false)
      await this.pollSignals()
    } catch (error) {
      this.fail(error)
    }
  }

  async decline(): Promise<void> {
    const context = this.getContext()
    const callId = this.state.callId
    if (!context || !callId) return
    try {
      const result = await this.client.rpc('chat_decline_voice_call', {
        p_call_id: callId,
        p_device_id: context.deviceId,
      })
      if (result.error) throw result.error
    } finally {
      this.resetToIdle()
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
      await this.reportDiagnostics('teardown')
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
    for (const track of this.localStream?.getAudioTracks() ?? []) track.enabled = !muted
    this.publish({ muted })
    void this.reportMediaState('control', { reason: muted ? 'mute_on' : 'mute_off' })
  }

  async chooseSpeaker(): Promise<void> {
    const audio = this.remoteAudio
    const devices = navigator.mediaDevices as SelectAudioOutputCapable | undefined
    const selectOutput = devices?.selectAudioOutput
    const setSink = audio?.setSinkId
    if (!audio || typeof setSink !== 'function' || typeof selectOutput !== 'function') {
      this.publish({ speakerAvailable: false, speakerSelected: false })
      return
    }

    try {
      const output = await selectOutput.call(devices)
      await setSink.call(audio, output.deviceId)
      this.publish({ speakerAvailable: true, speakerSelected: true })
      void this.reportMediaState('control', { reason: 'audio_output_selected' })
    } catch {
      this.publish({ speakerAvailable: true, speakerSelected: false })
      void this.reportMediaState('error', { reason: 'audio_output_select_failed' })
    }
  }

  private publish(patch: Partial<VoiceCallState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
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
      const incoming = rows.find((row) => row.callee_profile_id === context.profileId && row.state === 'ringing')
      if (incoming) {
        this.backendState = incoming.state
        this.publish({
          phase: 'incoming',
          display: 'full',
          direction: 'incoming',
          callId: incoming.id,
          peerName: incoming.caller_display_name || 'Người gọi',
          connectedAt: null,
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

    if (current.state === 'connected') {
      this.publish({
        phase: 'active',
        peerName,
        connectedAt: current.connected_at ? new Date(current.connected_at).getTime() : this.state.connectedAt ?? Date.now(),
      })
    } else if (current.state === 'accepted' || current.state === 'connecting') {
      this.publish({ phase: 'connecting', peerName })
    } else {
      this.publish({ peerName })
    }
  }

  private async ensureLocalAudio(): Promise<void> {
    if (this.localStream) return
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
  }

  private async ensureIceServers(): Promise<RTCIceServer[]> {
    if (this.iceServers) return this.iceServers
    this.iceServers = await fetchCallIceServers(this.client)
    return this.iceServers
  }

  private async createPeer(isCaller: boolean): Promise<void> {
    if (!this.state.callId) throw new Error('call_id_missing')
    if (!this.localStream) await this.ensureLocalAudio()
    const iceServers = await this.ensureIceServers()
    this.cleanupPeerOnly()

    this.remoteAudio = document.createElement('audio') as SinkCapableAudio
    this.remoteAudio.autoplay = true
    this.remoteAudio.muted = false
    this.remoteAudio.volume = 1
    this.remoteAudio.setAttribute('playsinline', '')
    this.remoteAudio.style.display = 'none'
    document.body.append(this.remoteAudio)

    const devices = navigator.mediaDevices as SelectAudioOutputCapable | undefined
    const speakerAvailable = typeof this.remoteAudio.setSinkId === 'function' && typeof devices?.selectAudioOutput === 'function'
    this.publish({ speakerAvailable })

    this.peer = new RTCPeerConnection({ iceServers })

    for (const track of this.localStream?.getTracks() ?? []) this.peer.addTrack(track, this.localStream!)

    this.peer.ontrack = (event) => {
      if (!this.remoteAudio) return
      this.remoteAudio.srcObject = event.streams[0] ?? new MediaStream([event.track])
      void this.remoteAudio.play()
        .then(() => this.reportMediaState('playback', { reason: 'remote_audio_playing' }))
        .catch((error) => this.reportMediaState('error', {
          reason: 'remote_audio_play_failed',
          message: error instanceof Error ? error.message : String(error),
        }))
    }

    this.peer.onicecandidate = (event) => {
      if (!event.candidate) return
      void this.sendSignal('ice', event.candidate.toJSON())
    }

    this.peer.onicecandidateerror = () => {
      void this.reportMediaState('error', {
        reason: 'ice_candidate_error',
        ice_state: this.peer?.iceConnectionState ?? 'closed',
      })
    }

    this.peer.onconnectionstatechange = () => {
      if (!this.peer) return
      void this.reportDiagnostics('connection_state')
      if (this.peer.connectionState === 'connected') {
        void this.client.rpc('chat_mark_voice_call_connected', { p_call_id: this.state.callId })
        this.publish({ phase: 'active', connectedAt: this.state.connectedAt ?? Date.now(), error: null })
      } else if (this.peer.connectionState === 'failed') {
        void this.endFailed()
      }
    }

    this.lastSignalId = 0
    this.pendingIce = []
    this.startSignalPolling()
    this.startDiagnosticsPolling()
    void this.reportMediaState('peer', {
      reason: 'peer_created_turn',
      turn: 'turn',
      sender_audio: this.peer.getSenders().filter((sender) => sender.track?.kind === 'audio').length,
      receiver_audio: this.peer.getReceivers().filter((receiver) => receiver.track?.kind === 'audio').length,
    })

    if (isCaller) {
      const offer = await this.peer.createOffer({ offerToReceiveAudio: true })
      await this.peer.setLocalDescription(offer)
      await this.sendSignal('offer', { type: offer.type, sdp: offer.sdp })
      void this.reportMediaState('signal', { reason: 'offer_sent' })
    }
  }

  private startSignalPolling(): void {
    if (this.signalTimer !== null) window.clearInterval(this.signalTimer)
    void this.pollSignals()
    this.signalTimer = window.setInterval(() => void this.pollSignals(), 400)
  }

  private startDiagnosticsPolling(): void {
    if (this.diagnosticsTimer !== null) window.clearInterval(this.diagnosticsTimer)
    void this.reportDiagnostics('initial')
    this.diagnosticsTimer = window.setInterval(() => void this.reportDiagnostics('periodic'), 2000)
  }

  private async reportDiagnostics(reason: string): Promise<void> {
    const peer = this.peer
    if (!peer) return
    try {
      const payload = await collectCallMediaDiagnostics(peer, this.localStream, this.remoteAudio)
      await this.reportMediaState('stats', { turn: 'turn', reason, ...payload })
    } catch {
      // Diagnostics are read-only and must never break the call path.
    }
  }

  private async reportMediaState(phase: string, payload: Record<string, unknown>): Promise<void> {
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
      // Diagnostics must not mutate or block media state.
    }
  }

  private async pollSignals(): Promise<void> {
    const callId = this.state.callId
    if (!callId || !this.peer) return
    const result = await this.client.rpc('chat_get_call_signals', {
      p_call_id: callId,
      p_after_id: this.lastSignalId,
    })
    if (result.error) return

    for (const signal of (result.data ?? []) as SignalRow[]) {
      this.lastSignalId = Math.max(this.lastSignalId, Number(signal.id))
      if (signal.sender_profile_id === this.getContext()?.profileId) continue
      await this.handleSignal(signal)
    }
  }

  private async handleSignal(signal: SignalRow): Promise<void> {
    const peer = this.peer
    if (!peer) return

    if (signal.kind === 'ice') {
      const candidate = signal.payload as RTCIceCandidateInit
      if (!peer.remoteDescription) this.pendingIce.push(candidate)
      else await peer.addIceCandidate(candidate)
      return
    }

    if (signal.kind === 'offer') {
      if (this.state.direction !== 'incoming' || peer.remoteDescription) return
      await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit)
      await this.flushIce()
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      await this.sendSignal('answer', { type: answer.type, sdp: answer.sdp })
      await this.client.rpc('chat_mark_voice_call_connecting', { p_call_id: this.state.callId })
      this.publish({ phase: 'connecting' })
      void this.reportMediaState('signal', { reason: 'answer_sent' })
      return
    }

    if (signal.kind === 'answer') {
      if (this.state.direction !== 'outgoing' || peer.remoteDescription) return
      await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit)
      await this.flushIce()
      await this.client.rpc('chat_mark_voice_call_connecting', { p_call_id: this.state.callId })
      this.publish({ phase: 'connecting' })
      void this.reportMediaState('signal', { reason: 'answer_applied' })
    }
  }

  private async flushIce(): Promise<void> {
    const peer = this.peer
    if (!peer?.remoteDescription) return
    const queued = this.pendingIce.splice(0)
    for (const candidate of queued) await peer.addIceCandidate(candidate)
  }

  private async sendSignal(kind: 'offer' | 'answer' | 'ice', payload: unknown): Promise<void> {
    const context = this.getContext()
    const callId = this.state.callId
    if (!context || !callId) return
    const result = await this.client.rpc('chat_send_call_signal', {
      p_call_id: callId,
      p_device_id: context.deviceId,
      p_kind: kind,
      p_payload: payload,
    })
    if (result.error) throw result.error
  }

  private async endFailed(): Promise<void> {
    await this.reportDiagnostics('failed')
    const callId = this.state.callId
    if (callId) await this.client.rpc('chat_end_voice_call', { p_call_id: callId, p_reason: 'failed' })
    this.fail(new Error('media_connection_failed'))
  }

  private cleanupPeerOnly(): void {
    if (this.signalTimer !== null) window.clearInterval(this.signalTimer)
    this.signalTimer = null
    if (this.diagnosticsTimer !== null) window.clearInterval(this.diagnosticsTimer)
    this.diagnosticsTimer = null
    this.peer?.close()
    this.peer = null
    if (this.remoteAudio) {
      this.remoteAudio.pause()
      this.remoteAudio.srcObject = null
      this.remoteAudio.remove()
    }
    this.remoteAudio = null
    this.pendingIce = []
    this.lastSignalId = 0
  }

  private cleanupMedia(): void {
    this.cleanupPeerOnly()
    for (const track of this.localStream?.getTracks() ?? []) track.stop()
    this.localStream = null
    this.iceServers = null
  }

  private resetToIdle(): void {
    this.cleanupMedia()
    this.backendState = null
    this.state = { ...DEFAULT_STATE }
    for (const listener of this.listeners) listener(this.state)
  }

  private fail(error: unknown): void {
    this.cleanupMedia()
    const message = error instanceof Error ? error.message : String(error)
    this.publish({ phase: 'error', error: message })
  }
}
