import { supabase } from '../supabase/client'
import { MATRIX_PROFILES } from './matrix-profiles'
import { createMatrixRunSessionId } from './matrix-run-id'
import { decodeProfileReady, encodeProfileReady, MATRIX_PROFILE_SYNC_TOPIC, peerReadyForProfile } from './matrix-sync'
import { evaluateMatrixVerdict } from './matrix-verdict'
import { MINIMAL_CALL_TEST_VERSION } from './version-label'

const LIVEKIT_SDK_URL = 'https://esm.sh/livekit-client@2.22.1'
const LIVEKIT_VERSION = '2.22.1'
const TOKEN_SERVER_ID = 'taphoachat-1x4n2g'
const ROOM_NAME = 'taphoa-minimal-call-v15-matrix'
const P2P_RPC = 'taphoa.v15.p2p.offer'
const PROFILE_SYNC_TIMEOUT_MS = 30_000
const PROFILE_SYNC_RETRY_MS = 400
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const num = (value) => typeof value === 'number' && Number.isFinite(value) ? value : 0

async function waitIce(pc, timeout = 5000) {
  if (pc.iceGatheringState === 'complete') return
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout)
    const done = () => {
      if (pc.iceGatheringState !== 'complete') return
      clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', done)
      resolve()
    }
    pc.addEventListener('icegatheringstatechange', done)
  })
}

function deviceName() {
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'iOS Web'
  if (/Android/i.test(navigator.userAgent)) return 'Android Web'
  return 'Desktop Web'
}

function profileTrackName(profile) {
  return `matrix:${profile.id}`
}

export class MatrixCallOwner {
  constructor(output, onState) {
    this.output = output
    this.onState = onState
    this.lk = null
    this.room = null
    this.localStream = null
    this.localTrack = null
    this.publicationTrack = null
    this.remoteTrack = null
    this.pc = null
    this.responderPc = null
    this.bridgeContext = null
    this.analyserContext = null
    this.analyser = null
    this.analyserData = null
    this.localEnergyPeak = 0
    this.results = []
    this.logs = []
    this.stopped = true
    this.identity = ''
    this.activeProfileId = null
    this.peerProfiles = new Map()
  }

  emit(status, current, secondsLeft) {
    this.onState({ running: !this.stopped, status, current, secondsLeft, results: [...this.results] })
  }

  log(message) {
    this.logs.push(`${new Date().toISOString()} ${message}`)
    if (this.logs.length > 250) this.logs.shift()
  }

  async getCredentials() {
    this.lk ??= await import(/* @vite-ignore */ LIVEKIT_SDK_URL)
    const source = this.lk.TokenSource.developmentTokenServer(TOKEN_SERVER_ID)
    return source.fetch({ roomName: ROOM_NAME, participantIdentity: this.identity, participantName: deviceName() })
  }

  async connectRoom(profile) {
    const credentials = await this.getCredentials()
    this.activeProfileId = profile.id
    this.peerProfiles = new Map()
    this.remoteTrack = null
    this.room = new this.lk.Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: false })
    this.room.on(this.lk.RoomEvent.TrackSubscribed, (track, publication) => {
      if (track.kind !== 'audio') return
      const trackName = String(publication?.trackName ?? publication?.name ?? '')
      if (trackName !== profileTrackName(profile)) {
        this.log(`ignore remote audio name=${trackName || 'unnamed'} active=${profile.id}`)
        return
      }
      this.remoteTrack = track
      track.attach(this.output)
      this.output.autoplay = true
      this.output.muted = false
      this.output.volume = 1
      this.output.play().catch((error) => this.log(`play blocked=${String(error)}`))
    })
    this.room.on(this.lk.RoomEvent.TrackUnsubscribed, (track) => {
      if (track !== this.remoteTrack) return
      try { track.detach(this.output) } catch {}
      this.remoteTrack = null
    })
    this.room.on(this.lk.RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (topic !== MATRIX_PROFILE_SYNC_TOPIC || !participant?.identity) return
      const message = decodeProfileReady(payload)
      if (!message) return
      this.peerProfiles.set(String(participant.identity), message.profile)
      this.log(`peer profile identity=${participant.identity} profile=${message.profile}`)
    })
    this.room.on(this.lk.RoomEvent.ParticipantDisconnected, (participant) => {
      if (participant?.identity) this.peerProfiles.delete(String(participant.identity))
    })
    await this.room.connect(credentials.serverUrl, credentials.participantToken, { autoSubscribe: true })
    try { await this.room.startAudio() } catch (error) { this.log(`startAudio=${String(error)}`) }
  }

  async announceProfile(profile) {
    await this.room.localParticipant.publishData(encodeProfileReady(profile.id), {
      reliable: true,
      topic: MATRIX_PROFILE_SYNC_TOPIC,
    })
  }

  matchingPeerReady(profile) {
    const connectedPeerIds = Array.from(this.room?.remoteParticipants?.keys?.() ?? [])
    return peerReadyForProfile(connectedPeerIds, this.peerProfiles, profile.id)
  }

  async waitForMatchingPeer(profile) {
    const startedAt = Date.now()
    this.log(`sync wait profile=${profile.id}`)
    while (!this.stopped) {
      await this.announceProfile(profile)
      if (this.matchingPeerReady(profile)) {
        this.log(`sync matched profile=${profile.id}`)
        return
      }
      if (Date.now() - startedAt >= PROFILE_SYNC_TIMEOUT_MS) {
        throw new Error(`profile sync timeout: ${profile.id}`)
      }
      this.emit(`Chờ máy kia cùng kiểu ${profile.label}…`, profile.id)
      await sleep(PROFILE_SYNC_RETRY_MS)
    }
    throw new Error(`matrix stopped while syncing: ${profile.id}`)
  }

  async publishLiveKit(track, profile) {
    const pub = await this.room.localParticipant.publishTrack(track, {
      source: this.lk.Track.Source.Microphone,
      name: profileTrackName(profile),
    })
    this.publicationTrack = pub?.track ?? track
    this.localTrack = this.publicationTrack?.mediaStreamTrack ?? track
    this.startAnalyser(this.localTrack)
  }

  startAnalyser(track) {
    this.localEnergyPeak = 0
    this.analyserContext = new AudioContext()
    const source = this.analyserContext.createMediaStreamSource(new MediaStream([track]))
    this.analyser = this.analyserContext.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyserContext.resume().catch(() => {})
  }

  sampleMic() {
    if (!this.analyser || !this.analyserData) return 0
    this.analyser.getByteTimeDomainData(this.analyserData)
    let sum = 0
    for (const value of this.analyserData) {
      const x = (value - 128) / 128
      sum += x * x
    }
    const rms = Math.sqrt(sum / this.analyserData.length)
    this.localEnergyPeak = Math.max(this.localEnergyPeak, rms)
    return rms
  }

  async liveKitStats() {
    const result = { outboundBytes: 0, inboundBytes: 0, inboundEnergy: 0 }
    try { result.outboundBytes = num((await this.publicationTrack?.getSenderStats?.())?.bytesSent) } catch {}
    try {
      const stats = await this.remoteTrack?.getReceiverStats?.()
      result.inboundBytes = num(stats?.bytesReceived)
      result.inboundEnergy = num(stats?.totalAudioEnergy)
    } catch {}
    return result
  }

  async peerStats(pc) {
    const result = { outboundBytes: 0, inboundBytes: 0, inboundEnergy: 0 }
    if (!pc) return result
    const report = await pc.getStats()
    report.forEach((entry) => {
      if (entry.type === 'outbound-rtp' && (entry.kind === 'audio' || entry.mediaType === 'audio')) result.outboundBytes += num(entry.bytesSent)
      if (entry.type === 'inbound-rtp' && (entry.kind === 'audio' || entry.mediaType === 'audio')) {
        result.inboundBytes += num(entry.bytesReceived)
        result.inboundEnergy += num(entry.totalAudioEnergy)
      }
    })
    return result
  }

  attachP2P(stream) {
    this.output.srcObject = stream
    this.output.autoplay = true
    this.output.muted = false
    this.output.volume = 1
    this.output.play().catch((error) => this.log(`p2p play blocked=${String(error)}`))
  }

  buildPeer(track) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pc.addTrack(track, new MediaStream([track]))
    pc.ontrack = (event) => this.attachP2P(event.streams[0] ?? new MediaStream([event.track]))
    return pc
  }

  async setupP2P() {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.localTrack = this.localStream.getAudioTracks()[0]
    if (!this.localTrack) throw new Error('native microphone missing')
    this.startAnalyser(this.localTrack)

    this.room.localParticipant.registerRpcMethod(P2P_RPC, async (data) => {
      const { offer } = JSON.parse(data.payload)
      this.responderPc?.close()
      this.responderPc = this.buildPeer(this.localTrack)
      await this.responderPc.setRemoteDescription(offer)
      await this.responderPc.setLocalDescription(await this.responderPc.createAnswer())
      await waitIce(this.responderPc)
      return JSON.stringify({ answer: this.responderPc.localDescription })
    })

    await sleep(1200)
    const peers = Array.from(this.room.remoteParticipants.values()).sort((a, b) => String(a.identity).localeCompare(String(b.identity)))
    const remote = peers[0]
    if (!remote) throw new Error('p2p remote participant missing')
    if (this.identity.localeCompare(String(remote.identity)) > 0) return

    this.pc = this.buildPeer(this.localTrack)
    await this.pc.setLocalDescription(await this.pc.createOffer())
    await waitIce(this.pc)
    const response = await this.room.localParticipant.performRpc({
      destinationIdentity: remote.identity,
      method: P2P_RPC,
      payload: JSON.stringify({ offer: this.pc.localDescription }),
      responseTimeout: 8000,
    })
    const { answer } = JSON.parse(response)
    await this.pc.setRemoteDescription(answer)
  }

  async setupProfile(profile) {
    if (profile.id === 'livekit-precapture') {
      this.lk ??= await import(/* @vite-ignore */ LIVEKIT_SDK_URL)
      const track = await this.lk.createLocalAudioTrack()
      this.localTrack = track.mediaStreamTrack
      await this.connectRoom(profile)
      await this.waitForMatchingPeer(profile)
      await this.publishLiveKit(track, profile)
      return
    }

    await this.connectRoom(profile)
    await this.waitForMatchingPeer(profile)
    if (profile.id === 'native-p2p') return this.setupP2P()

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const nativeTrack = this.localStream.getAudioTracks()[0]
    if (!nativeTrack) throw new Error('native microphone missing')
    if (profile.id === 'native-livekit') return this.publishLiveKit(nativeTrack, profile)

    this.bridgeContext = new AudioContext()
    await this.bridgeContext.resume().catch(() => {})
    const source = this.bridgeContext.createMediaStreamSource(this.localStream)
    const destination = this.bridgeContext.createMediaStreamDestination()
    source.connect(destination)
    const bridgeTrack = destination.stream.getAudioTracks()[0]
    if (!bridgeTrack) throw new Error('webaudio bridge track missing')
    await this.publishLiveKit(bridgeTrack, profile)
  }

  async save(profile, result) {
    try {
      await supabase.rpc('chat_submit_minimal_call_run', {
        p_run_session_id: createMatrixRunSessionId(),
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
    } catch (error) { this.log(`save failed=${String(error)}`) }
  }

  async cleanup() {
    try { this.room?.localParticipant.unregisterRpcMethod?.(P2P_RPC) } catch {}
    try { this.publicationTrack?.stop?.() } catch {}
    try { this.localStream?.getTracks().forEach((track) => track.stop()) } catch {}
    try { this.localTrack?.stop?.() } catch {}
    try { this.remoteTrack?.detach?.(this.output) } catch {}
    this.pc?.close(); this.responderPc?.close()
    try { await this.room?.disconnect?.() } catch {}
    try { await this.bridgeContext?.close() } catch {}
    try { await this.analyserContext?.close() } catch {}
    this.output.srcObject = null
    this.room = this.localStream = this.localTrack = this.publicationTrack = this.remoteTrack = this.pc = this.responderPc = null
    this.bridgeContext = this.analyserContext = this.analyser = this.analyserData = null
    this.peerProfiles = new Map()
    this.activeProfileId = null
  }

  async runProfile(profile) {
    this.logs = [`${new Date().toISOString()} profile=${profile.id}`]
    await this.setupProfile(profile)
    let stats = { outboundBytes: 0, inboundBytes: 0, inboundEnergy: 0 }
    for (let second = profile.seconds; second > 0 && !this.stopped; second--) {
      this.emit(`Đang thử ${profile.label}`, profile.id, second)
      this.sampleMic()
      stats = profile.transport === 'p2p' ? await this.peerStats(this.pc ?? this.responderPc) : await this.liveKitStats()
      await sleep(1000)
    }
    const verdict = evaluateMatrixVerdict({ localEnergy: this.localEnergyPeak, ...stats })
    this.log(`verdict=${verdict} localEnergy=${this.localEnergyPeak} outboundBytes=${stats.outboundBytes} inboundBytes=${stats.inboundBytes} inboundEnergy=${stats.inboundEnergy}`)
    return { id: profile.id, label: profile.label, localEnergy: this.localEnergyPeak, ...stats, verdict }
  }

  async runAll() {
    if (!this.stopped) return
    this.stopped = false
    this.results = []
    const prefix = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'web'
    this.identity = `${prefix}-${crypto.randomUUID().slice(0, 8)}`
    this.emit('Bắt đầu Auto Matrix…')
    for (const profile of MATRIX_PROFILES) {
      if (this.stopped) break
      try {
        const result = await this.runProfile(profile)
        this.results.push(result)
        await this.save(profile, result)
      } catch (error) {
        const result = { id: profile.id, label: profile.label, localEnergy: this.localEnergyPeak, outboundBytes: 0, inboundBytes: 0, inboundEnergy: 0, verdict: 'fail' }
        this.results.push(result)
        this.log(`profile error=${error instanceof Error ? error.message : String(error)}`)
        await this.save(profile, result)
      } finally { await this.cleanup() }
      if (!this.stopped) await sleep(900)
    }
    this.stopped = true
    this.onState({ running: false, status: this.results.length === 4 ? 'Đã chạy xong 4 kiểu' : 'Đã dừng', results: [...this.results] })
  }

  async stop() {
    this.stopped = true
    await this.cleanup()
    this.onState({ running: false, status: 'Đã dừng', results: [...this.results] })
  }
}

export const MATRIX_ROOM_NAME = ROOM_NAME
export const MATRIX_LIVEKIT_VERSION = LIVEKIT_VERSION
