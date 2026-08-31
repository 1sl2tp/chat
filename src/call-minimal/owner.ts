import { supabase } from '../supabase/client'
import { MinimalCallLifecycle, type MinimalCallPhase } from './owner-lifecycle'
import { summarizeMinimalCall, type MinimalCallMetrics, type MinimalCallSummary } from './summary'

const LIVEKIT_SDK_URL = 'https://esm.sh/livekit-client@2.22.1'
const LIVEKIT_VERSION = '2.22.1'
const TOKEN_SERVER_ID = 'taphoachat-1x4n2g'
const TEST_VERSION = 'minimal-call-v1'
const ROOM_NAME = 'taphoa-minimal-call-v1'
const CHECKPOINT_MS = 10_000

interface SenderStats {
  bytesSent: number
  packetsSent: number
  packetsLost: number
  jitter: number
  roundTripTime: number
}

interface ReceiverStats {
  bytesReceived: number
  packetsReceived: number
  packetsLost: number
  jitter: number
  totalAudioEnergy: number
  concealedSamples: number
}

interface StatsSample {
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

function detectDeviceName(): string {
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

function emptySender(): SenderStats {
  return { bytesSent: 0, packetsSent: 0, packetsLost: 0, jitter: 0, roundTripTime: 0 }
}

function emptyReceiver(): ReceiverStats {
  return { bytesReceived: 0, packetsReceived: 0, packetsLost: 0, jitter: 0, totalAudioEnergy: 0, concealedSamples: 0 }
}

export class MinimalCallOwner {
  readonly lifecycle = new MinimalCallLifecycle()

  private room: any = null
  private lk: any = null
  private localMicTrack: any = null
  private remoteAudioTrack: any = null
  private baselineSender: SenderStats = emptySender()
  private baselineReceiver: ReceiverStats = emptyReceiver()
  private latestSender: SenderStats = emptySender()
  private latestReceiver: ReceiverStats = emptyReceiver()
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
  private cleanLeave = false
  private finalizing = false
  private runId: string | undefined

  constructor(
    private readonly outputElement: HTMLAudioElement,
    private readonly onState: MinimalCallStateListener,
  ) {}

  private log(message: string): void {
    const line = `${new Date().toISOString()}  ${message}`
    this.logs.push(line)
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

  private async readSenderStats(track: any): Promise<SenderStats | null> {
    if (!track?.getSenderStats) return null
    try {
      const stats = await track.getSenderStats()
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

  private async readReceiverStats(track: any): Promise<ReceiverStats | null> {
    if (!track) return null
    try {
      let packetsReceived = 0
      let packetsLost = 0
      const receiver = track.receiver
      if (receiver?.getStats) {
        const report = await receiver.getStats()
        report.forEach((entry: any) => {
          if (entry.type === 'inbound-rtp' && (entry.kind === 'audio' || entry.mediaType === 'audio' || !entry.kind)) {
            packetsReceived = finite(entry.packetsReceived)
            packetsLost = finite(entry.packetsLost)
          }
        })
      }

      const stats = await track.getReceiverStats?.()
      if (!stats && packetsReceived === 0) return null
      return {
        bytesReceived: finite(stats?.bytesReceived),
        packetsReceived,
        packetsLost,
        jitter: finite(stats?.jitter),
        totalAudioEnergy: finite(stats?.totalAudioEnergy),
        concealedSamples: finite(stats?.concealedSamples),
      }
    } catch (error) {
      this.log(`receiver stats error=${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  private async captureSample(label: string): Promise<StatsSample> {
    const [sender, receiver] = await Promise.all([
      this.readSenderStats(this.localMicTrack),
      this.readReceiverStats(this.remoteAudioTrack),
    ])
    if (sender) this.latestSender = sender
    if (receiver) this.latestReceiver = receiver

    const sample: StatsSample = {
      atMs: Math.round(performance.now() - this.startedAt),
      label,
      sender,
      receiver,
      remoteParticipants: this.room?.remoteParticipants?.size ?? 0,
    }
    this.samples.push(sample)
    if (this.samples.length > 30) this.samples.splice(0, this.samples.length - 30)
    return sample
  }

  private getMediaTrack(): MediaStreamTrack | undefined {
    return this.localMicTrack?.mediaStreamTrack ?? this.localMicTrack?._mediaStreamTrack
  }

  private buildMeasuredMetrics(cleanLeave: boolean): MinimalCallMetrics {
    const mediaTrack = this.getMediaTrack()
    return {
      connected: this.connected,
      micTrackLive: mediaTrack?.readyState === 'live' && mediaTrack.enabled,
      outboundBytesDelta: delta(this.latestSender.bytesSent, this.baselineSender.bytesSent),
      outboundPacketsDelta: delta(this.latestSender.packetsSent, this.baselineSender.packetsSent),
      remoteTrackSubscribed: this.remoteTrackSubscribedEver,
      inboundBytesDelta: delta(this.latestReceiver.bytesReceived, this.baselineReceiver.bytesReceived),
      inboundPacketsDelta: delta(this.latestReceiver.packetsReceived, this.baselineReceiver.packetsReceived),
      playbackStarted: this.playbackStarted,
      cleanLeave,
    }
  }

  private buildMetricsPayload(cleanLeave: boolean): Record<string, unknown> {
    const measured = this.buildMeasuredMetrics(cleanLeave)
    return {
      ...measured,
      senderBaseline: this.baselineSender,
      senderLatest: this.latestSender,
      receiverBaseline: this.baselineReceiver,
      receiverLatest: this.latestReceiver,
      micSettings: this.micSettings,
      remoteParticipants: this.room?.remoteParticipants?.size ?? 0,
      playback: {
        paused: this.outputElement.paused,
        readyState: this.outputElement.readyState,
        currentTime: this.outputElement.currentTime,
      },
      samples: this.samples,
    }
  }

  private async submitRun(
    overallStatus: 'pass' | 'fail' | 'inconclusive' | 'error',
    summary: Record<string, unknown>,
    metrics: Record<string, unknown>,
  ): Promise<string | undefined> {
    if (!this.sessionId) return undefined
    const { data, error } = await supabase.rpc('chat_submit_minimal_call_run', {
      p_run_session_id: this.sessionId,
      p_test_version: TEST_VERSION,
      p_room_name: ROOM_NAME,
      p_participant_identity: this.participantIdentity,
      p_device: detectDeviceName(),
      p_user_agent: navigator.userAgent,
      p_livekit_version: LIVEKIT_VERSION,
      p_overall_status: overallStatus,
      p_duration_ms: Math.round(performance.now() - this.startedAt),
      p_summary: summary,
      p_metrics: metrics,
      p_logs: this.logs,
    })
    if (error) throw error
    this.runId = typeof data === 'string' ? data : this.runId
    return this.runId
  }

  private async saveCheckpoint(): Promise<void> {
    if (!this.connected || this.finalizing) return
    await this.captureSample('checkpoint')
    const measured = this.buildMeasuredMetrics(false)
    try {
      await this.submitRun(
        'inconclusive',
        {
          phase: this.lifecycle.phase,
          connection: measured.connected ? 'pass' : 'fail',
          microphone: measured.micTrackLive && measured.outboundBytesDelta > 0 ? 'pass' : 'pending',
          remoteAudio: measured.remoteTrackSubscribed && measured.inboundBytesDelta > 0 ? 'pass' : 'pending',
          playback: measured.playbackStarted ? 'pass' : 'pending',
          cleanup: 'pending',
        },
        this.buildMetricsPayload(false),
      )
    } catch (error) {
      this.log(`checkpoint save error=${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private startCheckpoints(): void {
    window.clearInterval(this.checkpointTimer)
    this.checkpointTimer = window.setInterval(() => {
      void this.saveCheckpoint()
    }, CHECKPOINT_MS)
  }

  private stopCheckpoints(): void {
    window.clearInterval(this.checkpointTimer)
    this.checkpointTimer = undefined
  }

  private async attachRemoteAudio(track: any, participant: any): Promise<void> {
    if (this.remoteAudioTrack && this.remoteAudioTrack !== track) {
      try {
        this.remoteAudioTrack.detach(this.outputElement)
      } catch {}
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
      this.log(`remote audio subscribed participant=${participant?.identity ?? 'unknown'} play=${this.playbackStarted}`)
    } catch (error) {
      this.playbackStarted = false
      this.log(`remote audio play blocked=${error instanceof Error ? error.message : String(error)}`)
    }

    const receiver = await this.readReceiverStats(track)
    if (receiver && this.baselineReceiver.bytesReceived === 0 && this.baselineReceiver.packetsReceived === 0) {
      this.baselineReceiver = receiver
      this.latestReceiver = receiver
    }
    this.emit('Đã nhận remote audio')
    void this.saveCheckpoint()
  }

  private bindRoomEvents(): void {
    const lk = this.lk
    this.room.on(lk.RoomEvent.TrackSubscribed, (track: any, _publication: any, participant: any) => {
      if (track.kind !== 'audio') return
      void this.attachRemoteAudio(track, participant)
    })

    this.room.on(lk.RoomEvent.TrackUnsubscribed, (track: any, _publication: any, participant: any) => {
      if (track !== this.remoteAudioTrack) return
      void this.captureSample('remote-track-unsubscribed').finally(() => {
        try {
          track.detach(this.outputElement)
        } catch {}
        this.remoteAudioTrack = null
        this.log(`remote audio unsubscribed participant=${participant?.identity ?? 'unknown'}`)
        this.emit('Remote audio đã rời')
      })
    })

    this.room.on(lk.RoomEvent.ParticipantConnected, (participant: any) => {
      this.log(`participant connected=${participant?.identity ?? 'unknown'}`)
      this.emit('Đã có người vào phòng')
    })

    this.room.on(lk.RoomEvent.ParticipantDisconnected, (participant: any) => {
      this.log(`participant disconnected=${participant?.identity ?? 'unknown'}`)
      this.emit('Người bên kia đã rời')
      void this.saveCheckpoint()
    })

    this.room.on(lk.RoomEvent.Reconnecting, () => {
      this.log('room reconnecting')
      this.emit('Đang kết nối lại…')
    })

    this.room.on(lk.RoomEvent.Reconnected, () => {
      this.log('room reconnected')
      this.emit('Đã kết nối lại')
      void this.saveCheckpoint()
    })

    this.room.on(lk.RoomEvent.Disconnected, (reason: unknown) => {
      this.log(`room disconnected reason=${String(reason ?? 'unknown')}`)
      if (!this.finalizing && (this.lifecycle.phase === 'connected' || this.lifecycle.phase === 'joining')) {
        void this.finishUnexpectedDisconnect()
      }
    })
  }

  async join(): Promise<void> {
    this.lifecycle.beginJoin()
    this.finalizing = false
    this.connected = false
    this.cleanLeave = false
    this.muted = false
    this.remoteTrackSubscribedEver = false
    this.playbackStarted = false
    this.runId = undefined
    this.logs = []
    this.samples = []
    this.baselineSender = emptySender()
    this.baselineReceiver = emptyReceiver()
    this.latestSender = emptySender()
    this.latestReceiver = emptyReceiver()
    this.startedAt = performance.now()
    this.sessionId = crypto.randomUUID()
    this.participantIdentity = `${identityPrefix()}-${this.sessionId}`
    this.emit('Đang vào phòng…')
    this.log(`session=${this.sessionId}`)
    this.log(`room=${ROOM_NAME}`)
    this.log(`identity=${this.participantIdentity}`)

    try {
      this.lk = await import(/* @vite-ignore */ LIVEKIT_SDK_URL)
      const source = this.lk.TokenSource.developmentTokenServer(TOKEN_SERVER_ID)
      const credentials = await source.fetch({
        roomName: ROOM_NAME,
        participantIdentity: this.participantIdentity,
        participantName: detectDeviceName(),
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

      const mediaTrack = this.getMediaTrack()
      this.micSettings = mediaTrack?.getSettings?.() ?? null
      this.log(`mic state readyState=${mediaTrack?.readyState ?? 'unknown'} enabled=${mediaTrack?.enabled ?? 'unknown'} muted=${mediaTrack?.muted ?? 'unknown'}`)
      this.log(`mic settings=${JSON.stringify(this.micSettings ?? {})}`)

      await new Promise((resolve) => setTimeout(resolve, 400))
      const sender = await this.readSenderStats(this.localMicTrack)
      if (sender) {
        this.baselineSender = sender
        this.latestSender = sender
      }
      await this.captureSample('joined')
      this.startCheckpoints()
      this.emit('Đã kết nối · mic bật')
      await this.saveCheckpoint()
    } catch (error) {
      await this.finishError(error)
      throw error
    }
  }

  async toggleMute(): Promise<void> {
    if (!this.room || this.lifecycle.phase !== 'connected') return
    const nextMuted = !this.muted
    try {
      const publication = await this.room.localParticipant.setMicrophoneEnabled(!nextMuted)
      this.muted = nextMuted
      if (!nextMuted) {
        const publications = Array.from(this.room.localParticipant.trackPublications.values()) as any[]
        this.localMicTrack = publication?.track ?? publications.find((item) => item.source === this.lk.Track.Source.Microphone)?.track ?? this.localMicTrack
      }
      this.log(nextMuted ? 'microphone muted' : 'microphone unmuted')
      await this.captureSample(nextMuted ? 'mute' : 'unmute')
      this.emit(nextMuted ? 'Mic đã tắt' : 'Mic đã bật')
      void this.saveCheckpoint()
    } catch (error) {
      this.log(`mute toggle error=${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  async leave(reason = 'user'): Promise<void> {
    if (this.finalizing || this.lifecycle.phase === 'idle' || this.lifecycle.phase === 'ended' || this.lifecycle.phase === 'error') return
    this.finalizing = true
    this.lifecycle.beginLeave()
    this.emit('Đang rời phòng…')
    this.log(`leave reason=${reason}`)
    this.stopCheckpoints()

    try {
      await this.captureSample('leave-before-disconnect')
      await this.room?.disconnect?.()
      this.cleanLeave = true
      this.lifecycle.markEnded()
      await this.captureSample('leave-after-disconnect')
      const measured = this.buildMeasuredMetrics(true)
      const summary = summarizeMinimalCall(measured)
      try {
        await this.submitRun(summary.overallStatus, summary as unknown as Record<string, unknown>, this.buildMetricsPayload(true))
        this.log(`final log saved id=${this.runId ?? 'unknown'}`)
      } catch (error) {
        this.log(`final log save error=${error instanceof Error ? error.message : String(error)}`)
      }
      this.emit('Đã rời phòng · log tự lưu', summary)
    } finally {
      this.cleanupMedia()
    }
  }

  private async finishUnexpectedDisconnect(): Promise<void> {
    if (this.finalizing) return
    this.finalizing = true
    this.stopCheckpoints()
    await this.captureSample('unexpected-disconnect')
    this.cleanLeave = false
    this.lifecycle.markEnded()
    const measured = this.buildMeasuredMetrics(false)
    const summary = summarizeMinimalCall(measured)
    try {
      await this.submitRun(summary.overallStatus, summary as unknown as Record<string, unknown>, this.buildMetricsPayload(false))
    } catch (error) {
      this.log(`unexpected disconnect save error=${error instanceof Error ? error.message : String(error)}`)
    }
    this.emit('Mất kết nối · log tự lưu', summary)
    this.cleanupMedia()
  }

  private async finishError(error: unknown): Promise<void> {
    if (this.finalizing) return
    this.finalizing = true
    this.stopCheckpoints()
    const message = error instanceof Error ? error.message : String(error)
    this.log(`ERROR ${message}`)
    try {
      await this.captureSample('error')
    } catch {}
    try {
      await this.room?.disconnect?.()
    } catch {}
    this.lifecycle.markError()
    try {
      await this.submitRun('error', { error: message }, this.buildMetricsPayload(false))
    } catch (submitError) {
      this.log(`error log save failed=${submitError instanceof Error ? submitError.message : String(submitError)}`)
    }
    this.emit(`Lỗi: ${message}`)
    this.cleanupMedia()
  }

  private cleanupMedia(): void {
    this.stopCheckpoints()
    try {
      this.remoteAudioTrack?.detach?.(this.outputElement)
    } catch {}
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
