import { supabase } from '../supabase/client'
import { MinimalCallLifecycle, type MinimalCallPhase } from './owner-lifecycle'
import { summarizeMinimalCall, type MinimalCallMetrics, type MinimalCallSummary } from './summary'

const LIVEKIT_SDK_URL = 'https://esm.sh/livekit-client@2.22.1'
const LIVEKIT_VERSION = '2.22.1'
const TOKEN_SERVER_ID = 'taphoachat-1x4n2g'
const TEST_VERSION = 'minimal-call-v1'
const ROOM_NAME = 'taphoa-minimal-call-v1'
const CHECKPOINT_MS = 10_000

type SenderStats = {
  bytesSent: number
  packetsSent: number
  packetsLost: number
  jitter: number
  roundTripTime: number
}

type ReceiverStats = {
  bytesReceived: number
  packetsReceived: number
  packetsLost: number
  jitter: number
  totalAudioEnergy: number
}

type StatsSample = {
  atMs: number
  label: string
  sender: SenderStats | null
  receiver: ReceiverStats | null
  remoteParticipants: number
}

export interface MinimalCallViewState {
  phase: MinimalCallPhase
  status: string
  muted: boolean
  remoteParticipants: number
  remoteAudioSubscribed: boolean
  playbackStarted: boolean
  runId?: string
  summary?: MinimalCallSummary
}

export type MinimalCallStateListener = (state: MinimalCallViewState) => void

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function delta(after: number, before: number): number {
  return Math.max(0, after - before)
}

function emptySender(): SenderStats {
  return { bytesSent: 0, packetsSent: 0, packetsLost: 0, jitter: 0, roundTripTime: 0 }
}

function emptyReceiver(): ReceiverStats {
  return { bytesReceived: 0, packetsReceived: 0, packetsLost: 0, jitter: 0, totalAudioEnergy: 0 }
}

function deviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Web'
  if (/Android/i.test(ua)) return 'Android Web'
  return 'Desktop Web'
}

function identityPrefix(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'web'
}

export class MinimalCallOwner {
  readonly lifecycle = new MinimalCallLifecycle()

  private readonly outputElement: HTMLAudioElement
  private readonly onState: MinimalCallStateListener
  private room: any = null
  private lk: any = null
  private localMicTrack: any = null
  private remoteAudioTrack: any = null
  private senderBaseline = emptySender()
  private senderLatest = emptySender()
  private receiverBaseline = emptyReceiver()
  private receiverLatest = emptyReceiver()
  private receiverBaselineSet = false
  private micSettings: MediaTrackSettings | null = null
  private logs: string[] = []
  private samples: StatsSample[] = []
  private checkpointTimer: number | undefined
  private startedAt = 0
  private sessionId = ''
  private participantIdentity = ''
  private muted = false
  private connected = false
  private remoteTrackSubscribedEver = false
  private playbackStarted = false
  private finalizing = false
  private runId: string | undefined

  constructor(outputElement: HTMLAudioElement, onState: MinimalCallStateListener) {
    this.outputElement = outputElement
    this.onState = onState
  }

  private log(message: string): void {
    this.logs.push(`${new Date().toISOString()}  ${message}`)
    if (this.logs.length > 200) this.logs.splice(0, this.logs.length - 200)
  }

  private emit(status: string, summary?: MinimalCallSummary): void {
    this.onState({
      phase: this.lifecycle.phase,
      status,
      muted: this.muted,
      remoteParticipants: this.room?.remoteParticipants?.size ?? 0,
      remoteAudioSubscribed: this.remoteTrackSubscribedEver,
      playbackStarted: this.playbackStarted,
      runId: this.runId,
      summary,
    })
  }

  private mediaTrack(): MediaStreamTrack | undefined {
    return this.localMicTrack?.mediaStreamTrack ?? this.localMicTrack?._mediaStreamTrack
  }

  private async readSender(): Promise<SenderStats | null> {
    if (!this.localMicTrack?.getSenderStats) return null
    try {
      const stats = await this.localMicTrack.getSenderStats()
      if (!stats) return null
      return {
        bytesSent: finite(stats.bytesSent),
        packetsSent: finite(stats.packetsSent),
        packetsLost: finite(stats.packetsLost),
        jitter: finite(stats.jitter),
        roundTripTime: finite(stats.roundTripTime),
      }
    } catch (error) {
      this.log(`sender stats error=${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  private async readReceiver(): Promise<ReceiverStats | null> {
    if (!this.remoteAudioTrack) return null
    try {
      let packetsReceived = 0
      let packetsLost = 0
      const receiver = this.remoteAudioTrack.receiver
      if (receiver?.getStats) {
        const report = await receiver.getStats()
        report.forEach((entry: any) => {
          if (entry.type === 'inbound-rtp' && (entry.kind === 'audio' || entry.mediaType === 'audio' || !entry.kind)) {
            packetsReceived = finite(entry.packetsReceived)
            packetsLost = finite(entry.packetsLost)
          }
        })
      }
      const stats = await this.remoteAudioTrack.getReceiverStats?.()
      if (!stats && packetsReceived === 0) return null
      return {
        bytesReceived: finite(stats?.bytesReceived),
        packetsReceived,
        packetsLost,
        jitter: finite(stats?.jitter),
        totalAudioEnergy: finite(stats?.totalAudioEnergy),
      }
    } catch (error) {
      this.log(`receiver stats error=${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  private async sample(label: string): Promise<void> {
    const [sender, receiver] = await Promise.all([this.readSender(), this.readReceiver()])
    if (sender) this.senderLatest = sender
    if (receiver) this.receiverLatest = receiver
    this.samples.push({
      atMs: Math.round(performance.now() - this.startedAt),
      label,
      sender,
      receiver,
      remoteParticipants: this.room?.remoteParticipants?.size ?? 0,
    })
    if (this.samples.length > 30) this.samples.splice(0, this.samples.length - 30)
  }

  private measured(cleanLeave: boolean): MinimalCallMetrics {
    const track = this.mediaTrack()
    return {
      connected: this.connected,
      micTrackLive: track?.readyState === 'live' && track.enabled,
      outboundBytesDelta: delta(this.senderLatest.bytesSent, this.senderBaseline.bytesSent),
      outboundPacketsDelta: delta(this.senderLatest.packetsSent, this.senderBaseline.packetsSent),
      remoteTrackSubscribed: this.remoteTrackSubscribedEver,
      inboundBytesDelta: delta(this.receiverLatest.bytesReceived, this.receiverBaseline.bytesReceived),
      inboundPacketsDelta: delta(this.receiverLatest.packetsReceived, this.receiverBaseline.packetsReceived),
      playbackStarted: this.playbackStarted,
      cleanLeave,
    }
  }

  private metrics(cleanLeave: boolean): Record<string, unknown> {
    return {
      ...this.measured(cleanLeave),
      senderBaseline: this.senderBaseline,
      senderLatest: this.senderLatest,
      receiverBaseline: this.receiverBaseline,
      receiverLatest: this.receiverLatest,
      micSettings: this.micSettings,
      playback: {
        paused: this.outputElement.paused,
        readyState: this.outputElement.readyState,
        currentTime: this.outputElement.currentTime,
      },
      samples: this.samples,
    }
  }

  private async submit(
    status: 'pass' | 'fail' | 'inconclusive' | 'error',
    summary: Record<string, unknown>,
    metrics: Record<string, unknown>,
  ): Promise<void> {
    if (!this.sessionId) return
    const { data, error } = await supabase.rpc('chat_submit_minimal_call_run', {
      p_run_session_id: this.sessionId,
      p_test_version: TEST_VERSION,
      p_room_name: ROOM_NAME,
      p_participant_identity: this.participantIdentity,
      p_device: deviceName(),
      p_user_agent: navigator.userAgent,
      p_livekit_version: LIVEKIT_VERSION,
      p_overall_status: status,
      p_duration_ms: Math.round(performance.now() - this.startedAt),
      p_summary: summary,
      p_metrics: metrics,
      p_logs: this.logs,
    })
    if (error) throw error
    if (typeof data === 'string') this.runId = data
  }

  private async checkpoint(): Promise<void> {
    if (!this.connected || this.finalizing) return
    await this.sample('checkpoint')
    const current = this.measured(false)
    try {
      await this.submit('inconclusive', {
        phase: this.lifecycle.phase,
        connection: current.connected ? 'pass' : 'fail',
        microphone: current.micTrackLive && current.outboundBytesDelta > 0 ? 'pass' : 'pending',
        remoteAudio: current.remoteTrackSubscribed && current.inboundBytesDelta > 0 ? 'pass' : 'pending',
        playback: current.playbackStarted ? 'pass' : 'pending',
        cleanup: 'pending',
      }, this.metrics(false))
    } catch (error) {
      this.log(`checkpoint save error=${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private startCheckpoints(): void {
    window.clearInterval(this.checkpointTimer)
    this.checkpointTimer = window.setInterval(() => void this.checkpoint(), CHECKPOINT_MS)
  }

  private stopCheckpoints(): void {
    window.clearInterval(this.checkpointTimer)
    this.checkpointTimer = undefined
  }

  private async attachRemote(track: any, participant: any): Promise<void> {
    if (this.remoteAudioTrack && this.remoteAudioTrack !== track) {
      try { this.remoteAudioTrack.detach(this.outputElement) } catch {}
    }
    this.remoteAudioTrack = track
    this.remoteTrackSubscribedEver = true
    track.attach(this.outputElement)
    this.outputElement.autoplay = true
    this.outputElement.muted = false
    this.outputElement.volume = 1
    try {
      await this.outputElement.play()
      this.playbackStarted = !this.outputElement.paused
      this.log(`remote audio participant=${participant?.identity ?? 'unknown'} play=${this.playbackStarted}`)
    } catch (error) {
      this.playbackStarted = false
      this.log(`remote play blocked=${error instanceof Error ? error.message : String(error)}`)
    }
    const receiver = await this.readReceiver()
    if (receiver && !this.receiverBaselineSet) {
      this.receiverBaseline = receiver
      this.receiverLatest = receiver
      this.receiverBaselineSet = true
    }
    this.emit('Đã nhận remote audio')
    void this.checkpoint()
  }

  private bindRoomEvents(): void {
    const events = this.lk.RoomEvent
    this.room.on(events.TrackSubscribed, (track: any, _publication: any, participant: any) => {
      if (track.kind === 'audio') void this.attachRemote(track, participant)
    })
    this.room.on(events.TrackUnsubscribed, (track: any, _publication: any, participant: any) => {
      if (track !== this.remoteAudioTrack) return
      void this.sample('remote-unsubscribed').finally(() => {
        try { track.detach(this.outputElement) } catch {}
        this.remoteAudioTrack = null
        this.log(`remote audio left=${participant?.identity ?? 'unknown'}`)
        this.emit('Remote audio đã rời')
      })
    })
    this.room.on(events.ParticipantConnected, (participant: any) => {
      this.log(`participant connected=${participant?.identity ?? 'unknown'}`)
      this.emit('Đã có người vào phòng')
    })
    this.room.on(events.ParticipantDisconnected, (participant: any) => {
      this.log(`participant disconnected=${participant?.identity ?? 'unknown'}`)
      this.emit('Người bên kia đã rời')
      void this.checkpoint()
    })
    this.room.on(events.Reconnecting, () => {
      this.log('room reconnecting')
      this.emit('Đang kết nối lại…')
    })
    this.room.on(events.Reconnected, () => {
      this.log('room reconnected')
      this.emit('Đã kết nối lại')
      void this.checkpoint()
    })
    this.room.on(events.Disconnected, (reason: unknown) => {
      this.log(`room disconnected reason=${String(reason ?? 'unknown')}`)
      if (!this.finalizing && (this.lifecycle.phase === 'connected' || this.lifecycle.phase === 'joining')) {
        void this.unexpectedDisconnect()
      }
    })
  }

  async join(): Promise<void> {
    this.lifecycle.beginJoin()
    this.resetRun()
    this.emit('Đang vào phòng…')
    this.log(`session=${this.sessionId}`)
    this.log(`room=${ROOM_NAME}`)
    try {
      this.lk = await import(/* @vite-ignore */ LIVEKIT_SDK_URL)
      const tokenSource = this.lk.TokenSource.developmentTokenServer(TOKEN_SERVER_ID)
      const credentials = await tokenSource.fetch({
        roomName: ROOM_NAME,
        participantIdentity: this.participantIdentity,
        participantName: deviceName(),
      })
      this.room = new this.lk.Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: false })
      this.bindRoomEvents()
      await this.room.connect(credentials.serverUrl, credentials.participantToken, { autoSubscribe: true })
      this.connected = true
      this.lifecycle.markConnected()
      this.log('room connected')
      try {
        await this.room.startAudio()
        this.log('room startAudio ok')
      } catch (error) {
        this.log(`room startAudio blocked=${error instanceof Error ? error.message : String(error)}`)
      }
      const publication = await this.room.localParticipant.setMicrophoneEnabled(true)
      const publications = Array.from(this.room.localParticipant.trackPublications.values()) as any[]
      this.localMicTrack = publication?.track ?? publications.find((item) => item.source === this.lk.Track.Source.Microphone)?.track
      if (!this.localMicTrack) throw new Error('local_microphone_track_missing')
      const mediaTrack = this.mediaTrack()
      this.micSettings = mediaTrack?.getSettings?.() ?? null
      this.log(`mic readyState=${mediaTrack?.readyState ?? 'unknown'} enabled=${mediaTrack?.enabled ?? 'unknown'} muted=${mediaTrack?.muted ?? 'unknown'}`)
      this.log(`mic settings=${JSON.stringify(this.micSettings ?? {})}`)
      await new Promise((resolve) => setTimeout(resolve, 400))
      const sender = await this.readSender()
      if (sender) {
        this.senderBaseline = sender
        this.senderLatest = sender
      }
      await this.sample('joined')
      this.startCheckpoints()
      this.emit('Đã kết nối · mic bật')
      await this.checkpoint()
    } catch (error) {
      await this.finishError(error)
      throw error
    }
  }

  async toggleMute(): Promise<void> {
    if (!this.room || this.lifecycle.phase !== 'connected') return
    const nextMuted = !this.muted
    const publication = await this.room.localParticipant.setMicrophoneEnabled(!nextMuted)
    this.muted = nextMuted
    if (!nextMuted) {
      const publications = Array.from(this.room.localParticipant.trackPublications.values()) as any[]
      this.localMicTrack = publication?.track ?? publications.find((item) => item.source === this.lk.Track.Source.Microphone)?.track ?? this.localMicTrack
    }
    this.log(nextMuted ? 'microphone muted' : 'microphone unmuted')
    await this.sample(nextMuted ? 'mute' : 'unmute')
    this.emit(nextMuted ? 'Mic đã tắt' : 'Mic đã bật')
    void this.checkpoint()
  }

  async leave(reason = 'user'): Promise<void> {
    if (this.finalizing || this.lifecycle.phase === 'idle' || this.lifecycle.phase === 'ended' || this.lifecycle.phase === 'error') return
    this.finalizing = true
    this.lifecycle.beginLeave()
    this.stopCheckpoints()
    this.emit('Đang rời phòng…')
    this.log(`leave reason=${reason}`)
    try {
      await this.sample('leave')
      await this.room?.disconnect?.()
      this.lifecycle.markEnded()
      const summary = summarizeMinimalCall(this.measured(true))
      try {
        await this.submit(summary.overallStatus, summary as unknown as Record<string, unknown>, this.metrics(true))
        this.log(`final log saved=${this.runId ?? 'unknown'}`)
      } catch (error) {
        this.log(`final log save error=${error instanceof Error ? error.message : String(error)}`)
      }
      this.emit('Đã rời phòng · log tự lưu', summary)
    } finally {
      this.cleanup()
    }
  }

  private async unexpectedDisconnect(): Promise<void> {
    if (this.finalizing) return
    this.finalizing = true
    this.stopCheckpoints()
    await this.sample('unexpected-disconnect')
    this.lifecycle.markEnded()
    const summary = summarizeMinimalCall(this.measured(false))
    try { await this.submit(summary.overallStatus, summary as unknown as Record<string, unknown>, this.metrics(false)) } catch {}
    this.emit('Mất kết nối · log tự lưu', summary)
    this.cleanup()
  }

  private async finishError(error: unknown): Promise<void> {
    if (this.finalizing) return
    this.finalizing = true
    this.stopCheckpoints()
    const message = error instanceof Error ? error.message : String(error)
    this.log(`ERROR ${message}`)
    try { await this.sample('error') } catch {}
    try { await this.room?.disconnect?.() } catch {}
    this.lifecycle.markError()
    try { await this.submit('error', { error: message }, this.metrics(false)) } catch {}
    this.emit(`Lỗi: ${message}`)
    this.cleanup()
  }

  private resetRun(): void {
    this.finalizing = false
    this.connected = false
    this.muted = false
    this.remoteTrackSubscribedEver = false
    this.playbackStarted = false
    this.runId = undefined
    this.logs = []
    this.samples = []
    this.senderBaseline = emptySender()
    this.senderLatest = emptySender()
    this.receiverBaseline = emptyReceiver()
    this.receiverLatest = emptyReceiver()
    this.receiverBaselineSet = false
    this.startedAt = performance.now()
    this.sessionId = crypto.randomUUID()
    this.participantIdentity = `${identityPrefix()}-${this.sessionId}`
  }

  private cleanup(): void {
    this.stopCheckpoints()
    try { this.remoteAudioTrack?.detach?.(this.outputElement) } catch {}
    this.remoteAudioTrack = null
    try {
      this.outputElement.pause()
      this.outputElement.srcObject = null
    } catch {}
    this.room = null
    this.localMicTrack = null
  }
}

export const MINIMAL_CALL_ROOM_NAME = ROOM_NAME
export const MINIMAL_CALL_LIVEKIT_VERSION = LIVEKIT_VERSION
