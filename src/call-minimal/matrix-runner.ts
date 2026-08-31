import { supabase } from '../supabase/client'
import { shouldLeadMatrix, matrixRunKey } from './matrix-coordination'
import { diagnoseMatrixPath, type MatrixDiagnosis } from './matrix-evaluation'
import { TrackEnergyProbe, type EnergyResult } from './matrix-energy'
import { MATRIX_PROFILE_IDS, matrixProfileLabel, nextMatrixProfileAt, type MatrixProfileId } from './matrix-profiles'
import { decodeMatrixMessage, encodeMatrixMessage, type MatrixDevice, type MatrixMessage } from './matrix-protocol'
import { MINIMAL_CALL_TEST_VERSION } from './version-label'

const LIVEKIT_SDK_URL = 'https://esm.sh/livekit-client@2.22.1'
const LIVEKIT_VERSION = '2.22.1'
const TOKEN_SERVER_ID = 'taphoachat-1x4n2g'
const CONTROL_ROOM = 'taphoa-minimal-call-v15-control'
const PRECAPTURE_ROOM = 'taphoa-minimal-call-v15-precapture'
const CONTROL_TOPIC = 'taphoa-matrix-v15'
const ARMED_KEY = 'v15-pending'
const PROFILE_DURATION_MS = 12_000
const CLEANUP_GAP_MS = 3_000
const START_DELAY_MS = 3_000
const ARMED_RETRY_MS = 1_000

export type MatrixPhase = 'idle' | 'connecting' | 'waiting-peer' | 'armed' | 'running' | 'done' | 'error'
export type MatrixResultStatus = 'pass' | 'fail' | 'error'

export interface MatrixProfileResult {
  profile: MatrixProfileId
  label: string
  status: MatrixResultStatus
  diagnosis?: MatrixDiagnosis
  localEnergy: number
  sentEnergy?: number
  outboundBytes: number
  remoteEnergy: number
  note?: string
}

export interface MatrixViewState {
  phase: MatrixPhase
  status: string
  peerConnected: boolean
  currentProfile?: MatrixProfileId
  runKey?: string
  results: MatrixProfileResult[]
}

export type MatrixStateListener = (state: MatrixViewState) => void

type SenderStats = {
  bytesSent: number
  packetsSent: number
  packetsLost: number
}

type ReceiverStats = {
  bytesReceived: number
  packetsReceived: number
  packetsLost: number
  totalAudioEnergy: number
}

type ProfileOutcome = {
  result: MatrixProfileResult
  metrics: Record<string, unknown>
  roomName: string
  logs: string[]
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function emptySender(): SenderStats {
  return { bytesSent: 0, packetsSent: 0, packetsLost: 0 }
}

function emptyReceiver(): ReceiverStats {
  return { bytesReceived: 0, packetsReceived: 0, packetsLost: 0, totalAudioEnergy: 0 }
}

function deviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Web'
  if (/Android/i.test(ua)) return 'Android Web'
  return 'Desktop Web'
}

function matrixDevice(): MatrixDevice {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'web'
}

function identityPrefix(): string {
  return matrixDevice()
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)))
}

function mediaTrackFromLiveKit(track: any): MediaStreamTrack | undefined {
  return track?.mediaStreamTrack ?? track?._mediaStreamTrack
}

async function readLiveKitSender(track: any): Promise<SenderStats> {
  try {
    const stats = await track?.getSenderStats?.()
    return {
      bytesSent: finite(stats?.bytesSent),
      packetsSent: finite(stats?.packetsSent),
      packetsLost: finite(stats?.packetsLost),
    }
  } catch {
    return emptySender()
  }
}

async function readLiveKitReceiver(track: any): Promise<ReceiverStats> {
  const result = emptyReceiver()
  try {
    const receiverStats = await track?.getReceiverStats?.()
    result.bytesReceived = finite(receiverStats?.bytesReceived)
    result.totalAudioEnergy = finite(receiverStats?.totalAudioEnergy)
  } catch {}
  try {
    const report = await track?.receiver?.getStats?.()
    report?.forEach?.((entry: any) => {
      if (entry.type !== 'inbound-rtp') return
      if (entry.kind && entry.kind !== 'audio' && entry.mediaType !== 'audio') return
      result.bytesReceived = Math.max(result.bytesReceived, finite(entry.bytesReceived))
      result.packetsReceived = Math.max(result.packetsReceived, finite(entry.packetsReceived))
      result.packetsLost = Math.max(result.packetsLost, finite(entry.packetsLost))
      result.totalAudioEnergy = Math.max(result.totalAudioEnergy, finite(entry.totalAudioEnergy))
    })
  } catch {}
  return result
}

async function readPeerStats(pc: RTCPeerConnection): Promise<{ sender: SenderStats; receiver: ReceiverStats }> {
  const sender = emptySender()
  const receiver = emptyReceiver()
  try {
    const report = await pc.getStats()
    report.forEach((entry) => {
      const record = entry as RTCStats & Record<string, unknown>
      const mediaType = String(record.kind ?? record.mediaType ?? '')
      if (mediaType && mediaType !== 'audio') return
      if (record.type === 'outbound-rtp') {
        sender.bytesSent = Math.max(sender.bytesSent, finite(record.bytesSent))
        sender.packetsSent = Math.max(sender.packetsSent, finite(record.packetsSent))
      }
      if (record.type === 'remote-inbound-rtp') {
        sender.packetsLost = Math.max(sender.packetsLost, finite(record.packetsLost))
      }
      if (record.type === 'inbound-rtp') {
        receiver.bytesReceived = Math.max(receiver.bytesReceived, finite(record.bytesReceived))
        receiver.packetsReceived = Math.max(receiver.packetsReceived, finite(record.packetsReceived))
        receiver.packetsLost = Math.max(receiver.packetsLost, finite(record.packetsLost))
        receiver.totalAudioEnergy = Math.max(receiver.totalAudioEnergy, finite(record.totalAudioEnergy))
      }
    })
  } catch {}
  return { sender, receiver }
}

function resultFor(
  profile: MatrixProfileId,
  local: EnergyResult,
  sender: SenderStats,
  receiver: ReceiverStats,
  sent?: EnergyResult,
  note?: string,
): MatrixProfileResult {
  const localForDiagnosis = sent?.averageRms ?? local.averageRms
  const diagnosis = diagnoseMatrixPath({
    localEnergy: localForDiagnosis,
    outboundBytes: sender.bytesSent,
    remoteEnergy: receiver.totalAudioEnergy,
  })
  return {
    profile,
    label: matrixProfileLabel(profile),
    status: diagnosis === 'audio-alive' ? 'pass' : 'fail',
    diagnosis,
    localEnergy: local.averageRms,
    sentEnergy: sent?.averageRms,
    outboundBytes: sender.bytesSent,
    remoteEnergy: receiver.totalAudioEnergy,
    note,
  }
}

export class MatrixRunner {
  private readonly outputElement: HTMLAudioElement
  private readonly onState: MatrixStateListener
  private lk: any = null
  private controlRoom: any = null
  private audioContext: AudioContext | null = null
  private participantIdentity = `${identityPrefix()}-${crypto.randomUUID()}`
  private peerIdentity = ''
  private localArmed = false
  private startIssued = false
  private runStarted = false
  private stopped = false
  private runKey = ''
  private phase: MatrixPhase = 'idle'
  private currentProfile: MatrixProfileId | undefined
  private results: MatrixProfileResult[] = []
  private armedTimer: number | undefined
  private expectedTrackName = ''
  private activeRemoteTrack: any = null
  private activeRemoteTrackName = ''
  private liveKitSilenceDetected = false
  private p2pPc: RTCPeerConnection | null = null
  private p2pPending: MatrixMessage[] = []
  private p2pIcePending: RTCIceCandidateInit[] = []

  constructor(outputElement: HTMLAudioElement, onState: MatrixStateListener) {
    this.outputElement = outputElement
    this.onState = onState
    this.emit('Sẵn sàng')
  }

  private emit(status: string): void {
    this.onState({
      phase: this.phase,
      status,
      peerConnected: Boolean(this.peerIdentity),
      currentProfile: this.currentProfile,
      runKey: this.runKey || undefined,
      results: [...this.results],
    })
  }

  private profileTrackName(profile: MatrixProfileId): string {
    return `matrix:${this.runKey}:${profile}`
  }

  private async sendControl(message: MatrixMessage): Promise<void> {
    if (!this.controlRoom) return
    await this.controlRoom.localParticipant.publishData(encodeMatrixMessage(message), {
      reliable: true,
      topic: CONTROL_TOPIC,
    })
  }

  private bindControlRoom(): void {
    const events = this.lk.RoomEvent
    this.controlRoom.on(events.ParticipantConnected, (participant: any) => {
      if (!this.peerIdentity) this.peerIdentity = participant?.identity ?? ''
      this.emit('Đã thấy máy bên kia')
      if (this.localArmed) void this.sendArmed()
    })
    this.controlRoom.on(events.ParticipantDisconnected, (participant: any) => {
      if (participant?.identity === this.peerIdentity) this.peerIdentity = ''
      this.emit('Máy bên kia đã rời')
    })
    this.controlRoom.on(events.DataReceived, (payload: Uint8Array, participant: any, _kind: unknown, topic?: string) => {
      if (topic !== CONTROL_TOPIC) return
      const message = decodeMatrixMessage(payload)
      if (!message) return
      void this.handleControl(message, participant?.identity ?? '')
    })
    this.controlRoom.on(events.TrackSubscribed, (track: any, publication: any) => {
      if (track?.kind !== 'audio') return
      const trackName = String(publication?.trackName ?? publication?.name ?? '')
      if (!this.expectedTrackName || trackName !== this.expectedTrackName) return
      this.activeRemoteTrack = track
      this.activeRemoteTrackName = trackName
      try { track.attach(this.outputElement) } catch {}
      this.outputElement.autoplay = true
      this.outputElement.playsInline = true
      this.outputElement.muted = false
      this.outputElement.volume = 1
      void this.outputElement.play().catch(() => undefined)
    })
    this.controlRoom.on(events.TrackUnsubscribed, (track: any) => {
      if (track !== this.activeRemoteTrack) return
      try { track.detach(this.outputElement) } catch {}
      this.activeRemoteTrack = null
      this.activeRemoteTrackName = ''
    })
    if (events.LocalAudioSilenceDetected) {
      this.controlRoom.on(events.LocalAudioSilenceDetected, () => {
        this.liveKitSilenceDetected = true
      })
    }
  }

  private async connectControlRoom(): Promise<void> {
    this.lk = await import(/* @vite-ignore */ LIVEKIT_SDK_URL)
    const tokenSource = this.lk.TokenSource.developmentTokenServer(TOKEN_SERVER_ID)
    const credentials = await tokenSource.fetch({
      roomName: CONTROL_ROOM,
      participantIdentity: this.participantIdentity,
      participantName: deviceName(),
    })
    this.controlRoom = new this.lk.Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: false })
    this.bindControlRoom()
    await this.controlRoom.connect(credentials.serverUrl, credentials.participantToken, { autoSubscribe: true })
    const participants = Array.from(this.controlRoom.remoteParticipants.values()) as any[]
    if (participants[0]?.identity) this.peerIdentity = participants[0].identity
    try { await this.controlRoom.startAudio() } catch {}
  }

  private async sendArmed(): Promise<void> {
    await this.sendControl({ type: 'armed', runKey: ARMED_KEY, device: matrixDevice() })
  }

  private async maybeIssueStart(): Promise<void> {
    if (!this.localArmed || !this.peerIdentity || this.startIssued || this.runStarted) return
    if (!shouldLeadMatrix(this.participantIdentity, this.peerIdentity)) return
    this.startIssued = true
    const runKey = matrixRunKey(crypto.randomUUID())
    const startAt = Date.now() + START_DELAY_MS
    await this.sendControl({ type: 'start', runKey, startAt })
    void this.scheduleRun(runKey, startAt)
  }

  private async handleControl(message: MatrixMessage, fromIdentity: string): Promise<void> {
    if (fromIdentity && fromIdentity !== this.participantIdentity && !this.peerIdentity) {
      this.peerIdentity = fromIdentity
    }
    if (message.type === 'armed') {
      if (message.runKey !== ARMED_KEY) return
      this.emit('Cả hai máy đang đồng bộ…')
      await this.maybeIssueStart()
      return
    }
    if (message.type === 'start') {
      if (this.runStarted) return
      void this.scheduleRun(message.runKey, message.startAt)
      return
    }
    if (!this.runKey || message.runKey !== this.runKey) return
    if (message.type === 'p2p-offer' || message.type === 'p2p-answer' || message.type === 'p2p-ice') {
      if (!this.p2pPc) {
        this.p2pPending.push(message)
        return
      }
      await this.applyP2pMessage(message)
    }
  }

  async startAll(): Promise<void> {
    if (this.phase !== 'idle' && this.phase !== 'done' && this.phase !== 'error') return
    this.resetForRun()
    this.phase = 'connecting'
    this.emit('Đang nối phòng điều khiển…')
    try {
      this.audioContext = new AudioContext({ latencyHint: 'interactive' })
      await this.audioContext.resume()
      await this.connectControlRoom()
      this.localArmed = true
      this.phase = this.peerIdentity ? 'armed' : 'waiting-peer'
      this.emit(this.peerIdentity ? 'Đã sẵn sàng · chờ đồng bộ' : 'Chờ máy bên kia bấm Chạy tất cả…')
      await this.sendArmed()
      window.clearInterval(this.armedTimer)
      this.armedTimer = window.setInterval(() => {
        if (!this.runStarted) void this.sendArmed()
      }, ARMED_RETRY_MS)
      await this.maybeIssueStart()
    } catch (error) {
      this.phase = 'error'
      this.emit(`Lỗi khởi động: ${error instanceof Error ? error.message : String(error)}`)
      await this.cleanupAll()
    }
  }

  private async scheduleRun(runKey: string, startAt: number): Promise<void> {
    if (this.runStarted) return
    this.runStarted = true
    this.runKey = runKey
    window.clearInterval(this.armedTimer)
    this.armedTimer = undefined
    this.phase = 'armed'
    this.emit('Đã đồng bộ · chuẩn bị chạy 4 kiểu…')
    await wait(startAt - Date.now())
    if (this.stopped) return
    this.phase = 'running'

    for (let index = 0; index < MATRIX_PROFILE_IDS.length; index += 1) {
      const profile = MATRIX_PROFILE_IDS[index]
      const targetAt = nextMatrixProfileAt(startAt, index, PROFILE_DURATION_MS, CLEANUP_GAP_MS)
      await wait(targetAt - Date.now())
      if (this.stopped) break
      this.currentProfile = profile
      this.emit(`Đang chạy ${index + 1}/4 · ${matrixProfileLabel(profile)}`)
      const startedAt = performance.now()
      let outcome: ProfileOutcome
      try {
        outcome = await this.runProfile(profile)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        outcome = {
          roomName: profile === 'native-p2p' ? 'native-p2p' : CONTROL_ROOM,
          logs: [`${new Date().toISOString()} ERROR ${message}`],
          result: {
            profile,
            label: matrixProfileLabel(profile),
            status: 'error',
            localEnergy: 0,
            outboundBytes: 0,
            remoteEnergy: 0,
            note: message,
          },
          metrics: { error: message },
        }
      }
      this.results.push(outcome.result)
      await this.submitProfile(outcome, performance.now() - startedAt)
      this.emit(`${matrixProfileLabel(profile)} · ${outcome.result.status.toUpperCase()}`)
      this.currentProfile = undefined
    }

    if (!this.stopped) {
      this.phase = 'done'
      this.emit('Xong 4 kiểu · log đã tự lưu')
    }
    await this.cleanupAll()
  }

  private async runProfile(profile: MatrixProfileId): Promise<ProfileOutcome> {
    switch (profile) {
      case 'native-livekit': return this.runNativeLiveKit()
      case 'native-p2p': return this.runNativeP2p()
      case 'webaudio-bridge': return this.runWebAudioBridge()
      case 'livekit-precapture': return this.runLiveKitPreCapture()
    }
  }

  private requireAudioContext(): AudioContext {
    if (!this.audioContext) throw new Error('audio_context_missing')
    return this.audioContext
  }

  private async nativeStream(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    if (!stream.getAudioTracks()[0]) throw new Error('native_microphone_track_missing')
    return stream
  }

  private clearRemoteOutput(): void {
    if (this.activeRemoteTrack) {
      try { this.activeRemoteTrack.detach(this.outputElement) } catch {}
    }
    this.activeRemoteTrack = null
    this.activeRemoteTrackName = ''
    this.expectedTrackName = ''
    try { this.outputElement.pause() } catch {}
    this.outputElement.srcObject = null
  }

  private async runNativeLiveKit(): Promise<ProfileOutcome> {
    const profile: MatrixProfileId = 'native-livekit'
    const logs: string[] = [`${new Date().toISOString()} capture=getUserMedia audio:true`, `${new Date().toISOString()} transport=LiveKit publish raw MediaStreamTrack`]
    const stream = await this.nativeStream()
    const rawTrack = stream.getAudioTracks()[0]
    const probe = new TrackEnergyProbe(this.requireAudioContext(), rawTrack)
    probe.start()
    this.liveKitSilenceDetected = false
    this.clearRemoteOutput()
    this.expectedTrackName = this.profileTrackName(profile)
    const publication = await this.controlRoom.localParticipant.publishTrack(rawTrack, {
      source: this.lk.Track.Source.Microphone,
      name: this.expectedTrackName,
    })
    try {
      await wait(PROFILE_DURATION_MS)
      const local = probe.stop()
      const sender = await readLiveKitSender(publication?.track)
      const receiver = this.activeRemoteTrackName === this.expectedTrackName
        ? await readLiveKitReceiver(this.activeRemoteTrack)
        : emptyReceiver()
      const result = resultFor(profile, local, sender, receiver, undefined, this.liveKitSilenceDetected ? 'LiveKit báo local silence' : undefined)
      return {
        result,
        roomName: CONTROL_ROOM,
        logs,
        metrics: {
          profile,
          matrixRunKey: this.runKey,
          capture: 'navigator.mediaDevices.getUserMedia({audio:true})',
          transport: 'livekit-raw-track',
          localEnergy: local,
          sender,
          receiver,
          micSettings: rawTrack.getSettings(),
          liveKitSilenceDetected: this.liveKitSilenceDetected,
        },
      }
    } finally {
      try { await this.controlRoom.localParticipant.unpublishTrack(publication?.track ?? rawTrack, true) } catch {}
      try { probe.stop() } catch {}
      stream.getTracks().forEach((track) => track.stop())
      this.clearRemoteOutput()
    }
  }

  private async runWebAudioBridge(): Promise<ProfileOutcome> {
    const profile: MatrixProfileId = 'webaudio-bridge'
    const logs: string[] = [`${new Date().toISOString()} capture=getUserMedia audio:true`, `${new Date().toISOString()} bridge=AudioContext MediaStreamDestination`, `${new Date().toISOString()} transport=LiveKit publish bridged track`]
    const stream = await this.nativeStream()
    const rawTrack = stream.getAudioTracks()[0]
    const context = this.requireAudioContext()
    const rawProbe = new TrackEnergyProbe(context, rawTrack)
    rawProbe.start()
    const source = context.createMediaStreamSource(stream)
    const destination = context.createMediaStreamDestination()
    source.connect(destination)
    const sentTrack = destination.stream.getAudioTracks()[0]
    if (!sentTrack) throw new Error('webaudio_destination_track_missing')
    const sentProbe = new TrackEnergyProbe(context, sentTrack)
    sentProbe.start()
    this.liveKitSilenceDetected = false
    this.clearRemoteOutput()
    this.expectedTrackName = this.profileTrackName(profile)
    const publication = await this.controlRoom.localParticipant.publishTrack(sentTrack, {
      source: this.lk.Track.Source.Microphone,
      name: this.expectedTrackName,
    })
    try {
      await wait(PROFILE_DURATION_MS)
      const local = rawProbe.stop()
      const sent = sentProbe.stop()
      const sender = await readLiveKitSender(publication?.track)
      const receiver = this.activeRemoteTrackName === this.expectedTrackName
        ? await readLiveKitReceiver(this.activeRemoteTrack)
        : emptyReceiver()
      let note: string | undefined
      if (local.averageRms >= 0.001 && sent.averageRms < 0.001) note = 'Raw mic có tiếng nhưng WebAudio bridge im'
      else if (this.liveKitSilenceDetected) note = 'LiveKit báo bridged track silence'
      const result = resultFor(profile, local, sender, receiver, sent, note)
      return {
        result,
        roomName: CONTROL_ROOM,
        logs,
        metrics: {
          profile,
          matrixRunKey: this.runKey,
          capture: 'native-getUserMedia',
          transport: 'webaudio-bridge-livekit',
          rawLocalEnergy: local,
          sentLocalEnergy: sent,
          sender,
          receiver,
          micSettings: rawTrack.getSettings(),
          sentSettings: sentTrack.getSettings(),
          liveKitSilenceDetected: this.liveKitSilenceDetected,
        },
      }
    } finally {
      try { await this.controlRoom.localParticipant.unpublishTrack(publication?.track ?? sentTrack, true) } catch {}
      try { rawProbe.stop() } catch {}
      try { sentProbe.stop() } catch {}
      try { source.disconnect() } catch {}
      destination.stream.getTracks().forEach((track) => track.stop())
      stream.getTracks().forEach((track) => track.stop())
      this.clearRemoteOutput()
    }
  }

  private async applyP2pMessage(message: MatrixMessage): Promise<void> {
    const pc = this.p2pPc
    if (!pc) {
      this.p2pPending.push(message)
      return
    }
    if (message.type === 'p2p-ice') {
      if (!pc.remoteDescription) {
        this.p2pIcePending.push(message.candidate)
        return
      }
      try { await pc.addIceCandidate(message.candidate) } catch {}
      return
    }
    if (message.type === 'p2p-offer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      if (pc.localDescription?.sdp) {
        await this.sendControl({ type: 'p2p-answer', runKey: this.runKey, sdp: pc.localDescription.sdp })
      }
      await this.flushP2pIce()
      return
    }
    if (message.type === 'p2p-answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp })
      await this.flushP2pIce()
    }
  }

  private async flushP2pIce(): Promise<void> {
    const pc = this.p2pPc
    if (!pc?.remoteDescription) return
    const queued = this.p2pIcePending.splice(0)
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate) } catch {}
    }
  }

  private async runNativeP2p(): Promise<ProfileOutcome> {
    const profile: MatrixProfileId = 'native-p2p'
    const logs: string[] = [`${new Date().toISOString()} capture=getUserMedia audio:true`, `${new Date().toISOString()} transport=native RTCPeerConnection addTrack`, `${new Date().toISOString()} livekit=data signaling only`]
    if (!this.peerIdentity) throw new Error('matrix_peer_missing')
    const stream = await this.nativeStream()
    const rawTrack = stream.getAudioTracks()[0]
    const probe = new TrackEnergyProbe(this.requireAudioContext(), rawTrack)
    probe.start()
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    this.p2pPc = pc
    this.p2pIcePending = []
    this.outputElement.srcObject = null
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] ?? new MediaStream([event.track])
      this.outputElement.srcObject = remoteStream
      this.outputElement.autoplay = true
      this.outputElement.playsInline = true
      this.outputElement.muted = false
      this.outputElement.volume = 1
      void this.outputElement.play().catch(() => undefined)
    }
    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      const candidate = event.candidate.toJSON()
      void this.sendControl({ type: 'p2p-ice', runKey: this.runKey, candidate })
    }
    pc.addTrack(rawTrack, stream)
    const pending = this.p2pPending.splice(0)
    for (const message of pending) await this.applyP2pMessage(message)
    if (shouldLeadMatrix(this.participantIdentity, this.peerIdentity)) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      if (pc.localDescription?.sdp) {
        await this.sendControl({ type: 'p2p-offer', runKey: this.runKey, sdp: pc.localDescription.sdp })
      }
    }
    try {
      await wait(PROFILE_DURATION_MS)
      const local = probe.stop()
      const { sender, receiver } = await readPeerStats(pc)
      const result = resultFor(profile, local, sender, receiver, undefined, `P2P state=${pc.connectionState}`)
      return {
        result,
        roomName: 'native-p2p',
        logs,
        metrics: {
          profile,
          matrixRunKey: this.runKey,
          capture: 'navigator.mediaDevices.getUserMedia({audio:true})',
          transport: 'native-RTCPeerConnection',
          localEnergy: local,
          sender,
          receiver,
          micSettings: rawTrack.getSettings(),
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
        },
      }
    } finally {
      try { probe.stop() } catch {}
      stream.getTracks().forEach((track) => track.stop())
      pc.ontrack = null
      pc.onicecandidate = null
      pc.close()
      this.p2pPc = null
      this.p2pPending = []
      this.p2pIcePending = []
      this.outputElement.srcObject = null
    }
  }

  private async runLiveKitPreCapture(): Promise<ProfileOutcome> {
    const profile: MatrixProfileId = 'livekit-precapture'
    const logs: string[] = [`${new Date().toISOString()} capture=LiveKit createLocalAudioTrack BEFORE room.connect`, `${new Date().toISOString()} transport=separate LiveKit room`]
    const localTrack = await this.lk.createLocalAudioTrack()
    const rawTrack = mediaTrackFromLiveKit(localTrack)
    if (!rawTrack) {
      try { localTrack.stop?.() } catch {}
      throw new Error('livekit_precapture_media_track_missing')
    }
    const probe = new TrackEnergyProbe(this.requireAudioContext(), rawTrack)
    probe.start()
    const tokenSource = this.lk.TokenSource.developmentTokenServer(TOKEN_SERVER_ID)
    const credentials = await tokenSource.fetch({
      roomName: PRECAPTURE_ROOM,
      participantIdentity: this.participantIdentity,
      participantName: deviceName(),
    })
    let remoteTrack: any = null
    let remoteTrackName = ''
    let silenceDetected = false
    const room = new this.lk.Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: false })
    const expectedName = this.profileTrackName(profile)
    room.on(this.lk.RoomEvent.TrackSubscribed, (track: any, publication: any) => {
      if (track?.kind !== 'audio') return
      const name = String(publication?.trackName ?? publication?.name ?? '')
      if (name !== expectedName) return
      remoteTrack = track
      remoteTrackName = name
      try { track.attach(this.outputElement) } catch {}
      this.outputElement.autoplay = true
      this.outputElement.playsInline = true
      this.outputElement.muted = false
      void this.outputElement.play().catch(() => undefined)
    })
    if (this.lk.RoomEvent.LocalAudioSilenceDetected) {
      room.on(this.lk.RoomEvent.LocalAudioSilenceDetected, () => { silenceDetected = true })
    }
    let publication: any = null
    try {
      await room.connect(credentials.serverUrl, credentials.participantToken, { autoSubscribe: true })
      publication = await room.localParticipant.publishTrack(localTrack, {
        source: this.lk.Track.Source.Microphone,
        name: expectedName,
      })
      try { await room.startAudio() } catch {}
      await wait(PROFILE_DURATION_MS)
      const local = probe.stop()
      const sender = await readLiveKitSender(publication?.track ?? localTrack)
      const receiver = remoteTrack && remoteTrackName === expectedName ? await readLiveKitReceiver(remoteTrack) : emptyReceiver()
      const result = resultFor(profile, local, sender, receiver, undefined, silenceDetected ? 'LiveKit báo pre-capture silence' : undefined)
      return {
        result,
        roomName: PRECAPTURE_ROOM,
        logs,
        metrics: {
          profile,
          matrixRunKey: this.runKey,
          capture: 'livekit-createLocalAudioTrack-before-connect',
          transport: 'livekit-separate-room',
          localEnergy: local,
          sender,
          receiver,
          micSettings: rawTrack.getSettings(),
          liveKitSilenceDetected: silenceDetected,
        },
      }
    } finally {
      try { probe.stop() } catch {}
      if (remoteTrack) try { remoteTrack.detach(this.outputElement) } catch {}
      try { await room.disconnect() } catch {}
      try { localTrack.stop?.() } catch {}
      this.outputElement.srcObject = null
    }
  }

  private async submitProfile(outcome: ProfileOutcome, durationMs: number): Promise<void> {
    const sessionId = crypto.randomUUID()
    const summary = {
      matrixRunKey: this.runKey,
      profile: outcome.result.profile,
      engine: outcome.result.label,
      diagnosis: outcome.result.diagnosis ?? 'error',
      localCapture: outcome.result.localEnergy >= 0.001 ? 'pass' : 'fail',
      transport: outcome.result.outboundBytes > 0 ? 'pass' : 'fail',
      remoteAudio: outcome.result.remoteEnergy >= 0.00001 ? 'pass' : 'fail',
      overallStatus: outcome.result.status,
      note: outcome.result.note ?? null,
    }
    const { error } = await supabase.rpc('chat_submit_minimal_call_run', {
      p_run_session_id: sessionId,
      p_test_version: MINIMAL_CALL_TEST_VERSION,
      p_room_name: outcome.roomName,
      p_participant_identity: this.participantIdentity,
      p_device: deviceName(),
      p_user_agent: navigator.userAgent,
      p_livekit_version: LIVEKIT_VERSION,
      p_overall_status: outcome.result.status,
      p_duration_ms: Math.round(durationMs),
      p_summary: summary,
      p_metrics: {
        ...outcome.metrics,
        buildId: import.meta.env.VITE_BUILD_ID ?? '',
        participantIdentity: this.participantIdentity,
        peerIdentity: this.peerIdentity,
      },
      p_logs: outcome.logs,
    })
    if (error) console.warn('matrix telemetry save failed', error)
  }

  private resetForRun(): void {
    this.stopped = false
    this.runStarted = false
    this.startIssued = false
    this.localArmed = false
    this.runKey = ''
    this.peerIdentity = ''
    this.results = []
    this.currentProfile = undefined
    this.expectedTrackName = ''
    this.activeRemoteTrack = null
    this.activeRemoteTrackName = ''
    this.p2pPending = []
    this.p2pIcePending = []
  }

  private async cleanupAll(): Promise<void> {
    window.clearInterval(this.armedTimer)
    this.armedTimer = undefined
    this.localArmed = false
    this.clearRemoteOutput()
    if (this.p2pPc) {
      try { this.p2pPc.close() } catch {}
      this.p2pPc = null
    }
    try { await this.controlRoom?.disconnect?.() } catch {}
    this.controlRoom = null
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { await this.audioContext.close() } catch {}
    }
    this.audioContext = null
  }
}
