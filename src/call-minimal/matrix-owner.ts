import { supabase } from '../supabase/client'
import { MATRIX_PROFILES, type MatrixProfile, type MatrixProfileId } from './matrix-profiles'
import { MINIMAL_CALL_TEST_VERSION } from './version-label'

const LIVEKIT_SDK_URL = 'https://esm.sh/livekit-client@2.22.1'
const LIVEKIT_VERSION = '2.22.1'
const TOKEN_SERVER_ID = 'taphoachat-1x4n2g'
const ROOM_NAME = 'taphoa-minimal-call-v15-matrix'
const P2P_RPC = 'taphoa.v15.p2p.offer'

export interface MatrixProfileResult {
  id: MatrixProfileId
  label: string
  localEnergy: number
  outboundBytes: number
  inboundBytes: number
  inboundEnergy: number
  verdict: 'pass' | 'fail' | 'inconclusive'
}

export interface MatrixState {
  running: boolean
  status: string
  current?: MatrixProfileId
  secondsLeft?: number
  results: MatrixProfileResult[]
}

type Listener = (state: MatrixState) => void

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

async function waitIceComplete(pc: RTCPeerConnection, timeoutMs = 5000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, timeoutMs)
    const done = () => {
      if (pc.iceGatheringState !== 'complete') return
      window.clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', done)
      resolve()
    }
    pc.addEventListener('icegatheringstatechange', done)
  })
}

function deviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Web'
  if (/Android/i.test(ua)) return 'Android Web'
  return 'Desktop Web'
}

export class MatrixCallOwner {
  private readonly output: HTMLAudioElement
  private readonly onState: Listener
  private lk: any
  private room: any
  private localStream: MediaStream | null = null
  private localTrack: MediaStreamTrack | null = null
  private publishedTrack: any = null
  private remoteTrack: any = null
  private pc: RTCPeerConnection | null = null
  private responderPc: RTCPeerConnection | null = null
  private audioContext: AudioContext | null = null
  private analyserContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private analyserData: Uint8Array<ArrayBuffer> | null = null
  private localEnergyPeak = 0
  private logs: string[] = []
  private results: MatrixProfileResult[] = []
  private stopped = false
  private identity = ''

  constructor(output: HTMLAudioElement, onState: Listener) {
    this.output = output
    this.onState = onState
  }

  private emit(status: string, current?: MatrixProfileId, secondsLeft?: number): void {
    this.onState({ running: !this.stopped, status, current, secondsLeft, results: [...this.results] })
  }

  private log(message: string): void {
    this.logs.push(`${new Date().toISOString()} ${message}`)
    if (this.logs.length > 300) this.logs.shift()
  }

  private async credentials(): Promise<{ serverUrl: string; participantToken: string }> {
    this.lk ??= await import(/* @vite-ignore */ LIVEKIT_SDK_URL)
    const source = this.lk.TokenSource.developmentTokenServer(TOKEN_SERVER_ID)
    return source.fetch({ roomName: ROOM_NAME, participantIdentity: this.identity, participantName: deviceName() })
  }

  private async connectRoom(preCaptured?: any): Promise<void> {
    const credentials = await this.credentials()
    this.room = new this.lk.Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: false })
    this.room.on(this.lk.RoomEvent.TrackSubscribed, (track: any) => {
      if (track.kind !== 'audio') return
      this.remoteTrack = track
      track.attach(this.output)
      this.output.autoplay = true
      this.output.muted = false
      this.output.volume = 1
      void this.output.play().catch((error) => this.log(`play blocked=${String(error)}`))
    })
    await this.room.connect(credentials.serverUrl, credentials.participantToken, { autoSubscribe: true })
    try { await this.room.startAudio() } catch (error) { this.log(`startAudio=${String(error)}`) }
    if (preCaptured) await this.publishLiveKitTrack(preCaptured)
  }

  private async publishLiveKitTrack(track: MediaStreamTrack | any): Promise<void> {
    const publication = await this.room.localParticipant.publishTrack(track, { source: this.lk.Track.Source.Microphone })
    this.publishedTrack = publication?.track ?? track
    this.localTrack = this.publishedTrack?.mediaStreamTrack ?? track
    this.startLocalAnalyser(this.localTrack)
  }

  private startLocalAnalyser(track: MediaStreamTrack): void {
    this.localEnergyPeak = 0
    this.analyserContext = new AudioContext()
    const source = this.analyserContext.createMediaStreamSource(new MediaStream([track]))
    this.analyser = this.analyserContext.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount)
    void this.analyserContext.resume().catch(() => {})
  }

  private sampleLocalEnergy(): number {
    if (!this.analyser || !this.analyserData) return 0
    this.analyser.getByteTimeDomainData(this.analyserData)
    let sum = 0
    for (const value of this.analyserData) {
      const normalized = (value - 128) / 128
      sum += normalized * normalized
    }
    const rms = Math.sqrt(sum / this.analyserData.length)
    this.localEnergyPeak = Math.max(this.localEnergyPeak, rms)
    return rms
  }

  private async liveKitStats(): Promise<{ outboundBytes: number; inboundBytes: number; inboundEnergy: number }> {
    let outboundBytes = 0
    let inboundBytes = 0
    let inboundEnergy = 0
    try {
      const stats = await this.publishedTrack?.getSenderStats?.()
      outboundBytes = finite(stats?.bytesSent)
    } catch {}
    try {
      const stats = await this.remoteTrack?.getReceiverStats?.()
      inboundBytes = finite(stats?.bytesReceived)
      inboundEnergy = finite(stats?.totalAudioEnergy)
    } catch {}
    return { outboundBytes, inboundBytes, inboundEnergy }
  }

  private async peerStats(pc: RTCPeerConnection | null): Promise<{ outboundBytes: number; inboundBytes: number; inboundEnergy: number }> {
    const totals = { outboundBytes: 0, inboundBytes: 0, inboundEnergy: 0 }
    if (!pc) return totals
    const report = await pc.getStats()
    report.forEach((entry) => {
      if (entry.type === 'outbound-rtp' && (entry.kind === 'audio' || entry.mediaType === 'audio')) totals.outboundBytes += finite(entry.bytesSent)
      if (entry.type === 'inbound-rtp' && (entry.kind === 'audio' || entry.mediaType === 'audio')) {
        totals.inboundBytes += finite(entry.bytesReceived)
        totals.inboundEnergy += finite(entry.totalAudioEnergy)
      }
    })
    return totals
  }

  private attachP2PRemote(stream: MediaStream): void {
    this.output.srcObject = stream
    this.output.autoplay = true
    this.output.muted = false
    this.output.volume = 1
    void this.output.play().catch((error) => this.log(`p2p play blocked=${String(error)}`))
  }

  private buildPeer(localTrack: MediaStreamTrack): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pc.addTrack(localTrack, new MediaStream([localTrack]))
    pc.ontrack = (event) => this.attachP2PRemote(event.streams[0] ?? new MediaStream([event.track]))
    return pc
  }

  private async setupP2P(): Promise<void> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.localTrack = this.localStream.getAudioTracks()[0] ?? null
    if (!this.localTrack) throw new Error('native microphone missing')
    this.startLocalAnalyser(this.localTrack)

    await this.room.localParticipant.registerRpcMethod(P2P_RPC, async (data: any) => {
      const payload = JSON.parse(data.payload) as { offer: RTCSessionDescriptionInit }
      this.responderPc?.close()
      this.responderPc = this.buildPeer(this.localTrack!)
      await this.responderPc.setRemoteDescription(payload.offer)
      const answer = await this.responderPc.createAnswer()
      await this.responderPc.setLocalDescription(answer)
      await waitIceComplete(this.responderPc)
      return JSON.stringify({ answer: this.responderPc.localDescription })
    })

    await wait(1200)
    const peers = Array.from(this.room.remoteParticipants.values()) as any[]
    const remote = peers.sort((a, b) => String(a.identity).localeCompare(String(b.identity)))[0]
    if (!remote) throw new Error('p2p remote participant missing')
    if (this.identity.localeCompare(String(remote.identity)) > 0) return

    this.pc = this.buildPeer(this.localTrack)
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    await waitIceComplete(this.pc)
    const response = await this.room.localParticipant.performRpc({
      destinationIdentity: remote.identity,
      method: P2P_RPC,
      payload: JSON.stringify({ offer: this.pc.localDescription }),
      responseTimeout: 8000,
    })
    const parsed = JSON.parse(response) as { answer: RTCSessionDescriptionInit }
    await this.pc.setRemoteDescription(parsed.answer)
  }

  private async setupProfile(profile: MatrixProfile): Promise<void> {
    if (profile.id === 'livekit-precapture') {
      this.lk ??= await import(/* @vite-ignore */ LIVEKIT_SDK_URL)
      const track = await this.lk.createLocalAudioTrack()
      this.localTrack = track.mediaStreamTrack
      await this.connectRoom(track)
      return
    }

    await this.connectRoom()
    if (profile.id === 'native-p2p') {
      await this.setupP2P()
      return
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const nativeTrack = this.localStream.getAudioTracks()[0]
    if (!nativeTrack) throw new Error('native microphone missing')

    if (profile.id === 'native-livekit') {
      await this.publishLiveKitTrack(nativeTrack)
      return
    }

    this.audioContext = new AudioContext()
    await this.audioContext.resume().catch(() => {})
    const source = this.audioContext.createMediaStreamSource(this.localStream)
    const destination = this.audioContext.createMediaStreamDestination()
    source.connect(destination)
    const bridgeTrack = destination.stream.getAudioTracks()[0]
    if (!bridgeTrack) throw new Error('webaudio bridge track missing')
    await this.publishLiveKitTrack(bridgeTrack)
  }

  private async save(profile: MatrixProfile, result: MatrixProfileResult): Promise<void> {
    try {
      await supabase.rpc('chat_submit_minimal_call_run', {
        p_run_session_id: `${this.identity}-${profile.id}-${Date.now()}`,
        p_test_version: MINIMAL_CALL_TEST_VERSION,
        p_room_name: ROOM_NAME,
        p_participant_identity: this.identity,
        p_device: deviceName(),
        p_user_agent: navigator.userAgent,
        p_livekit_version: LIVEKIT_VERSION,
        p_overall_status: result.verdict,
        p_duration_ms: profile.seconds * 1000,
        p_summary: { profile: profile.id, verdict: result.verdict },
        p_metrics: result,
        p_logs: this.logs,
      })
    } catch (error) {
      this.log(`save ${profile.id} failed=${String(error)}`)
    }
  }

  private async cleanupProfile(): Promise<void> {
    try { if (this.room) await this.room.localParticipant.unregisterRpcMethod?.(P2P_RPC) } catch {}
    try { this.publishedTrack?.stop?.() } catch {}
    try { this.localStream?.getTracks().forEach((track) => track.stop()) } catch {}
    try { this.localTrack?.stop() } catch {}
    try { this.remoteTrack?.detach?.(this.output) } catch {}
    this.pc?.close()
    this.responderPc?.close()
    try { await this.room?.disconnect?.() } catch {}
    try { await this.audioContext?.close() } catch {}
    try { await this.analyserContext?.close() } catch {}
    this.output.srcObject = null
    this.room = null
    this.localStream = null
    this.localTrack = null
    this.publishedTrack = null
    this.remoteTrack = null
    this.pc = null
    this.responderPc = null
    this.audioContext = null
    this.analyserContext = null
    this.analyser = null
    this.analyserData = null
  }

  private async runProfile(profile: MatrixProfile): Promise<MatrixProfileResult> {
    this.logs = []
    this.log(`profile=${profile.id}`)
    await this.setupProfile(profile)
    let latest = { outboundBytes: 0, inboundBytes: 0, inboundEnergy: 0 }
    for (let second = profile.seconds; second > 0 && !this.stopped; second--) {
      this.emit(`Đang thử ${profile.label}`, profile.id, second)
      this.sampleLocalEnergy()
      latest = profile.transport === 'p2p'
        ? await this.peerStats(this.pc ?? this.responderPc)
        : await this.liveKitStats()
      await wait(1000)
    }
    const localEnergy = this.localEnergyPeak
    const verdict = localEnergy > 0.002 && latest.outboundBytes > 0
      ? (latest.inboundBytes > 0 ? 'pass' : 'inconclusive')
      : 'fail'
    return { id: profile.id, label: profile.label, localEnergy, ...latest, verdict }
  }

  async runAll(): Promise<void> {
    if (!this.stopped && this.identity) return
    this.stopped = false
    this.results = []
    this.identity = `${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'web'}-${crypto.randomUUID().slice(0, 8)}`
    this.emit('Bắt đầu Auto Matrix…')
    for (const profile of MATRIX_PROFILES) {
      if (this.stopped) break
      try {
        const result = await this.runProfile(profile)
        this.results.push(result)
        await this.save(profile, result)
      } catch (error) {
        const result: MatrixProfileResult = { id: profile.id, label: profile.label, localEnergy: this.localEnergyPeak, outboundBytes: 0, inboundBytes: 0, inboundEnergy: 0, verdict: 'fail' }
        this.results.push(result)
        this.log(`profile error=${error instanceof Error ? error.message : String(error)}`)
        await this.save(profile, result)
      } finally {
        await this.cleanupProfile()
      }
      if (!this.stopped) await wait(900)
    }
    this.stopped = true
    this.onState({ running: false, status: this.results.length === MATRIX_PROFILES.length ? 'Đã chạy xong 4 kiểu' : 'Đã dừng', results: [...this.results] })
    this.identity = ''
  }

  async stop(): Promise<void> {
    this.stopped = true
    await this.cleanupProfile()
    this.onState({ running: false, status: 'Đã dừng', results: [...this.results] })
    this.identity = ''
  }
}

export const MATRIX_ROOM_NAME = ROOM_NAME
export const MATRIX_LIVEKIT_VERSION = LIVEKIT_VERSION
