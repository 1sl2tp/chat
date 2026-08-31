import {
  MatrixCallOwner as BaseMatrixCallOwner,
  MATRIX_LIVEKIT_VERSION,
  MATRIX_ROOM_NAME,
} from './matrix-owner.js'
import { classifyMatrixResult, primeDiagnosticAudioContext } from './matrix-diagnostics'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class MatrixCallOwner extends BaseMatrixCallOwner {
  constructor(output, onState) {
    super(output, onState)
    this.diagnosticContext = null
    this.diagnosticResumePromise = null
    this.analyserSource = null
    this.bridgeSource = null
    this.bridgeDestination = null
  }

  startAnalyser(track) {
    this.localEnergyPeak = 0
    this.analyserSource?.disconnect?.()
    this.analyserSource = null
    this.analyser = null
    this.analyserData = null

    const context = this.diagnosticContext
    if (!context) {
      this.log('meter context=unavailable')
      return
    }

    const source = context.createMediaStreamSource(new MediaStream([track]))
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    this.analyserSource = source
    this.analyser = analyser
    this.analyserData = new Uint8Array(analyser.frequencyBinCount)
    this.log(`meter context=${context.state} track=${track.readyState} enabled=${track.enabled} muted=${track.muted}`)
  }

  async setupProfile(profile) {
    if (profile.id !== 'webaudio-bridge') return super.setupProfile(profile)

    await this.connectRoom()
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const nativeTrack = this.localStream.getAudioTracks()[0]
    if (!nativeTrack) throw new Error('native microphone missing')

    const context = this.diagnosticContext
    if (!context) throw new Error('diagnostic AudioContext missing')

    this.bridgeSource?.disconnect?.()
    this.bridgeSource = context.createMediaStreamSource(this.localStream)
    this.bridgeDestination = context.createMediaStreamDestination()
    this.bridgeSource.connect(this.bridgeDestination)

    const bridgeTrack = this.bridgeDestination.stream.getAudioTracks()[0]
    if (!bridgeTrack) throw new Error('webaudio bridge track missing')
    await this.publishLiveKit(bridgeTrack)
  }

  meterState() {
    return this.diagnosticContext?.state ?? 'unavailable'
  }

  trackSnapshot() {
    const track = this.localTrack
    if (!track) return { readyState: 'missing', enabled: false, muted: false, settings: null }
    let settings = null
    try { settings = track.getSettings?.() ?? null } catch {}
    return {
      readyState: track.readyState ?? 'unknown',
      enabled: Boolean(track.enabled),
      muted: Boolean(track.muted),
      settings,
    }
  }

  async runProfile(profile) {
    this.logs = [`${new Date().toISOString()} profile=${profile.id}`]
    let stats = { outboundBytes: 0, inboundBytes: 0, inboundEnergy: 0 }
    let profileError = null

    try {
      await this.setupProfile(profile)
      for (let second = profile.seconds; second > 0 && !this.stopped; second--) {
        this.emit(`Đang thử ${profile.label}`, profile.id, second)
        this.sampleMic()
        stats = profile.transport === 'p2p'
          ? await this.peerStats(this.pc ?? this.responderPc)
          : await this.liveKitStats()
        await sleep(1000)
      }
    } catch (error) {
      profileError = error instanceof Error ? error.message : String(error)
      this.log(`profile error=${profileError}`)
    }

    const meterState = this.meterState()
    const track = this.trackSnapshot()
    const verdict = classifyMatrixResult({
      meterState,
      localEnergy: this.localEnergyPeak,
      outboundBytes: stats.outboundBytes,
      inboundBytes: stats.inboundBytes,
    })
    this.log(`result meter=${meterState} localEnergy=${this.localEnergyPeak} outbound=${stats.outboundBytes} inbound=${stats.inboundBytes} verdict=${verdict}`)

    return {
      id: profile.id,
      label: profile.label,
      localEnergy: this.localEnergyPeak,
      ...stats,
      meterState,
      track,
      profileError,
      verdict,
    }
  }

  async cleanup() {
    try { this.analyserSource?.disconnect?.() } catch {}
    try { this.bridgeSource?.disconnect?.() } catch {}
    this.analyserSource = null
    this.bridgeSource = null
    this.bridgeDestination = null
    await super.cleanup()
  }

  async closeDiagnosticContext() {
    const context = this.diagnosticContext
    this.diagnosticContext = null
    this.diagnosticResumePromise = null
    if (!context) return
    try { await context.close() } catch {}
  }

  async runAll() {
    if (!this.stopped) return

    const primed = primeDiagnosticAudioContext(() => new AudioContext())
    this.diagnosticContext = primed.context
    this.diagnosticResumePromise = primed.resumePromise
    primed.resumePromise.catch(() => {})

    try {
      await super.runAll()
    } finally {
      await this.closeDiagnosticContext()
    }
  }

  async stop() {
    await super.stop()
    await this.closeDiagnosticContext()
  }
}

export { MATRIX_LIVEKIT_VERSION, MATRIX_ROOM_NAME }
