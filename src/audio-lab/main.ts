import { supabase } from '../supabase/client'
import { scoreAudioLab, type AudioLabMeasuredMetrics } from './scoring'

const LIVEKIT_SDK_URL = 'https://esm.sh/livekit-client@2.22.1'
const LIVEKIT_VERSION = '2.22.1'
const TOKEN_SERVER_ID = 'taphoachat-1x4n2g'
const TEST_VERSION = 'audio-lab-v1'
const BASELINE_MS = 2500
const TONE_MS = 3000
const STABILIZE_MS = 1200

const startButton = document.querySelector<HTMLButtonElement>('#start-test')
const statusEl = document.querySelector<HTMLElement>('#status')
const resultEl = document.querySelector<HTMLElement>('#result')
const detailEl = document.querySelector<HTMLElement>('#detail')
const logEl = document.querySelector<HTMLPreElement>('#log')
const outputEl = document.querySelector<HTMLAudioElement>('#lab-output')

if (!startButton || !statusEl || !resultEl || !detailEl || !logEl || !outputEl) {
  throw new Error('Audio Lab DOM is incomplete')
}

let running = false
let logs: string[] = []

function deviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Web'
  if (/Android/i.test(ua)) return 'Android Web'
  return 'Desktop Web'
}

function log(message: string): void {
  const line = `${new Date().toISOString()}  ${message}`
  logs.push(line)
  logEl.textContent = logs.join('\n')
}

function setStatus(message: string): void {
  statusEl.textContent = message
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor<T>(read: () => T | null | undefined, timeoutMs: number, label: string): Promise<T> {
  const started = performance.now()
  while (performance.now() - started < timeoutMs) {
    const value = read()
    if (value) return value
    await sleep(80)
  }
  throw new Error(`timeout:${label}`)
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function delta(after: number, before: number): number {
  return Math.max(0, after - before)
}

interface Snapshot {
  micSenderBytes: number
  micSenderPackets: number
  botMicReceiverBytes: number
  botMicReceiverEnergy: number
  toneSenderBytes: number
  toneSenderPackets: number
  deviceToneReceiverBytes: number
  deviceToneReceiverEnergy: number
  deviceToneJitter: number
}

async function snapshot(localMicTrack: any, botRemoteMicTrack: any, localToneTrack: any, deviceRemoteToneTrack: any): Promise<Snapshot> {
  const [micSender, micReceiver, toneSender, toneReceiver] = await Promise.all([
    localMicTrack?.getSenderStats?.(),
    botRemoteMicTrack?.getReceiverStats?.(),
    localToneTrack?.getSenderStats?.(),
    deviceRemoteToneTrack?.getReceiverStats?.(),
  ])

  return {
    micSenderBytes: finite(micSender?.bytesSent),
    micSenderPackets: finite(micSender?.packetsSent),
    botMicReceiverBytes: finite(micReceiver?.bytesReceived),
    botMicReceiverEnergy: finite(micReceiver?.totalAudioEnergy),
    toneSenderBytes: finite(toneSender?.bytesSent),
    toneSenderPackets: finite(toneSender?.packetsSent),
    deviceToneReceiverBytes: finite(toneReceiver?.bytesReceived),
    deviceToneReceiverEnergy: finite(toneReceiver?.totalAudioEnergy),
    deviceToneJitter: finite(toneReceiver?.jitter),
  }
}

function renderScore(score: ReturnType<typeof scoreAudioLab>, metrics: AudioLabMeasuredMetrics, settings: MediaTrackSettings | null, runId?: string): void {
  const badge = score.overallStatus === 'pass' ? 'PASS MEDIA' : score.overallStatus === 'fail' ? 'FAIL' : 'INCONCLUSIVE'
  resultEl.textContent = badge
  resultEl.dataset.status = score.overallStatus

  const rows = [
    ['Mic → LiveKit → bot', score.micTransport.toUpperCase()],
    ['Bot → LiveKit → thiết bị', score.remoteTransport.toUpperCase()],
    ['Playback API', score.playbackPipeline.toUpperCase()],
    ['Echo-return heuristic', score.echoReturn.toUpperCase()],
    ['Loa vật lý earpiece/speaker', 'UNVERIFIED'],
    ['Tín hiệu âm học mic vật lý', 'UNVERIFIED'],
    ['Mic bytes gửi', Math.round(metrics.micSenderBytesDelta).toString()],
    ['Bot bytes nhận mic', Math.round(metrics.botMicReceiverBytesDelta).toString()],
    ['Tone energy nhận', metrics.deviceToneEnergyDelta.toFixed(6)],
    ['Echo leak ratio', score.echoLeakRatio == null ? 'n/a' : score.echoLeakRatio.toFixed(4)],
    ['echoCancellation', String(settings?.echoCancellation ?? 'unknown')],
    ['noiseSuppression', String(settings?.noiseSuppression ?? 'unknown')],
    ['autoGainControl', String(settings?.autoGainControl ?? 'unknown')],
    ['Log ID', runId ?? 'đang lưu…'],
  ]

  detailEl.innerHTML = rows.map(([name, value]) => `<div class="metric"><span>${name}</span><b>${value}</b></div>`).join('')
}

async function submitRun(args: {
  sessionId: string
  roomName: string
  overallStatus: 'pass' | 'fail' | 'inconclusive' | 'error'
  durationMs: number
  summary: Record<string, unknown>
  metrics: Record<string, unknown>
}): Promise<string | undefined> {
  const { data, error } = await supabase.rpc('chat_submit_audio_lab_run', {
    p_test_session_id: args.sessionId,
    p_test_version: TEST_VERSION,
    p_room_name: args.roomName,
    p_device: deviceName(),
    p_user_agent: navigator.userAgent,
    p_livekit_version: LIVEKIT_VERSION,
    p_overall_status: args.overallStatus,
    p_duration_ms: Math.round(args.durationMs),
    p_summary: args.summary,
    p_metrics: args.metrics,
    p_logs: logs,
  })
  if (error) throw error
  return typeof data === 'string' ? data : undefined
}

async function runLab(): Promise<void> {
  if (running) return
  running = true
  startButton.disabled = true
  logs = []
  resultEl.textContent = 'RUNNING'
  resultEl.dataset.status = 'running'
  detailEl.innerHTML = ''
  const startedAt = performance.now()
  const sessionId = crypto.randomUUID()
  const roomName = `taphoa-audio-lab-${sessionId}`

  let deviceRoom: any
  let botRoom: any
  let toneContext: AudioContext | undefined
  let toneOscillator: OscillatorNode | undefined
  let toneGain: GainNode | undefined
  let toneMediaTrack: MediaStreamTrack | undefined

  try {
    setStatus('Đang nạp LiveKit…')
    log(`session=${sessionId}`)
    log(`room=${roomName}`)
    const sdkUrl = LIVEKIT_SDK_URL
    const lk: any = await import(/* @vite-ignore */ sdkUrl)

    setStatus('Đang chuẩn bị bot âm thanh…')
    const AudioContextCtor = window.AudioContext ?? (window as any).webkitAudioContext
    if (!AudioContextCtor) throw new Error('AudioContext unsupported for synthetic bot')
    toneContext = new AudioContextCtor({ sampleRate: 48000 })
    await toneContext.resume()
    const destination = toneContext.createMediaStreamDestination()
    toneOscillator = toneContext.createOscillator()
    toneGain = toneContext.createGain()
    toneOscillator.frequency.value = 997
    toneGain.gain.value = 0
    toneOscillator.connect(toneGain).connect(destination)
    toneOscillator.start()
    toneMediaTrack = destination.stream.getAudioTracks()[0]
    log(`bot AudioContext state=${toneContext.state} sampleRate=${toneContext.sampleRate}`)

    const source = lk.TokenSource.developmentTokenServer(TOKEN_SERVER_ID)
    const deviceIdentity = `lab-device-${sessionId}`
    const botIdentity = `lab-bot-${sessionId}`
    setStatus('Đang lấy token cho 2 participant…')
    const [deviceCredentials, botCredentials] = await Promise.all([
      source.fetch({ roomName, participantIdentity: deviceIdentity, participantName: deviceName() }),
      source.fetch({ roomName, participantIdentity: botIdentity, participantName: 'Audio Lab Bot' }),
    ])

    deviceRoom = new lk.Room({ adaptiveStream: false, dynacast: false })
    botRoom = new lk.Room({ adaptiveStream: false, dynacast: false })

    let deviceRemoteToneTrack: any
    let botRemoteMicTrack: any
    let playbackApiPlaying = false

    deviceRoom.on(lk.RoomEvent.TrackSubscribed, async (track: any, _publication: any, participant: any) => {
      if (participant.identity !== botIdentity || track.kind !== 'audio') return
      deviceRemoteToneTrack = track
      track.attach(outputEl)
      outputEl.autoplay = true
      outputEl.playsInline = true
      outputEl.muted = false
      outputEl.volume = 1
      try {
        await outputEl.play()
        playbackApiPlaying = !outputEl.paused
        log(`remote tone playback play()=${playbackApiPlaying ? 'playing' : 'paused'}`)
      } catch (error) {
        playbackApiPlaying = false
        log(`remote tone playback blocked=${error instanceof Error ? error.message : String(error)}`)
      }
    })

    botRoom.on(lk.RoomEvent.TrackSubscribed, (track: any, _publication: any, participant: any) => {
      if (participant.identity !== deviceIdentity || track.kind !== 'audio') return
      botRemoteMicTrack = track
      log('bot subscribed device microphone')
    })

    setStatus('Đang kết nối LiveKit…')
    await Promise.all([
      deviceRoom.connect(deviceCredentials.serverUrl, deviceCredentials.participantToken, { autoSubscribe: true }),
      botRoom.connect(botCredentials.serverUrl, botCredentials.participantToken, { autoSubscribe: true }),
    ])
    log('both participants connected')

    try {
      await deviceRoom.startAudio()
      log('device room startAudio ok')
    } catch (error) {
      log(`device room startAudio failed=${error instanceof Error ? error.message : String(error)}`)
    }

    setStatus('Đang mở microphone thật…')
    const micPublication = await deviceRoom.localParticipant.setMicrophoneEnabled(true)
    const localMicTrack = micPublication?.track ?? Array.from(deviceRoom.localParticipant.trackPublications.values()).find((pub: any) => pub.source === lk.Track.Source.Microphone)?.track
    if (!localMicTrack) throw new Error('local microphone track missing')
    const mediaTrack: MediaStreamTrack | undefined = localMicTrack.mediaStreamTrack ?? localMicTrack._mediaStreamTrack
    const micSettings = mediaTrack?.getSettings?.() ?? null
    log(`mic readyState=${mediaTrack?.readyState ?? 'unknown'} enabled=${mediaTrack?.enabled ?? 'unknown'} muted=${mediaTrack?.muted ?? 'unknown'}`)
    log(`mic settings=${JSON.stringify(micSettings ?? {})}`)

    setStatus('Đang publish bot tone…')
    const tonePublication = await botRoom.localParticipant.publishTrack(toneMediaTrack, {
      source: lk.Track.Source.Microphone,
      name: 'audio-lab-tone',
    })
    const localToneTrack = tonePublication?.track ?? Array.from(botRoom.localParticipant.trackPublications.values()).find((pub: any) => pub.trackName === 'audio-lab-tone')?.track
    if (!localToneTrack) throw new Error('local bot tone track missing')

    deviceRemoteToneTrack = await waitFor(() => deviceRemoteToneTrack, 10000, 'device-tone-subscription')
    botRemoteMicTrack = await waitFor(() => botRemoteMicTrack, 10000, 'bot-mic-subscription')

    setStatus('Ổn định luồng…')
    await sleep(STABILIZE_MS)
    const s0 = await snapshot(localMicTrack, botRemoteMicTrack, localToneTrack, deviceRemoteToneTrack)

    setStatus('Đo nền im lặng…')
    toneGain.gain.setValueAtTime(0, toneContext.currentTime)
    await sleep(BASELINE_MS)
    const s1 = await snapshot(localMicTrack, botRemoteMicTrack, localToneTrack, deviceRemoteToneTrack)

    setStatus('Phát mẫu chuẩn 997 Hz…')
    toneGain.gain.setValueAtTime(0.16, toneContext.currentTime)
    await sleep(TONE_MS)
    const s2 = await snapshot(localMicTrack, botRemoteMicTrack, localToneTrack, deviceRemoteToneTrack)
    toneGain.gain.setValueAtTime(0, toneContext.currentTime)

    playbackApiPlaying = playbackApiPlaying || (!outputEl.paused && outputEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)

    const measured: AudioLabMeasuredMetrics = {
      micSenderBytesDelta: delta(s2.micSenderBytes, s0.micSenderBytes),
      botMicReceiverBytesDelta: delta(s2.botMicReceiverBytes, s0.botMicReceiverBytes),
      botToneSenderBytesDelta: delta(s2.toneSenderBytes, s1.toneSenderBytes),
      deviceToneReceiverBytesDelta: delta(s2.deviceToneReceiverBytes, s1.deviceToneReceiverBytes),
      deviceToneEnergyDelta: delta(s2.deviceToneReceiverEnergy, s1.deviceToneReceiverEnergy),
      baselineMicEnergyDelta: delta(s1.botMicReceiverEnergy, s0.botMicReceiverEnergy),
      toneMicEnergyDelta: delta(s2.botMicReceiverEnergy, s1.botMicReceiverEnergy),
      playbackApiPlaying,
    }

    const score = scoreAudioLab(measured)
    const metrics = {
      ...measured,
      baseline: s1,
      tone: s2,
      micSettings,
      micTrack: {
        enabled: mediaTrack?.enabled ?? null,
        muted: mediaTrack?.muted ?? null,
        readyState: mediaTrack?.readyState ?? null,
      },
      playback: {
        paused: outputEl.paused,
        readyState: outputEl.readyState,
        currentTime: outputEl.currentTime,
      },
    }
    const summary = {
      ...score,
      note: 'physical speaker route and acoustic mic signal are intentionally not inferred from browser API state',
    }

    setStatus('Đang tự lưu log Supabase…')
    const runId = await submitRun({
      sessionId,
      roomName,
      overallStatus: score.overallStatus,
      durationMs: performance.now() - startedAt,
      summary,
      metrics,
    })
    log(`supabase run id=${runId ?? 'unknown'}`)
    renderScore(score, measured, micSettings, runId)
    setStatus('Hoàn tất. Log đã gửi tự động.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`ERROR ${message}`)
    resultEl.textContent = 'ERROR'
    resultEl.dataset.status = 'error'
    detailEl.innerHTML = `<div class="error-text">${message}</div>`
    setStatus('Test lỗi. Đang lưu log lỗi…')
    try {
      const runId = await submitRun({
        sessionId,
        roomName,
        overallStatus: 'error',
        durationMs: performance.now() - startedAt,
        summary: { error: message },
        metrics: {},
      })
      log(`error run saved id=${runId ?? 'unknown'}`)
      setStatus('Test lỗi. Log lỗi đã gửi tự động.')
    } catch (submitError) {
      log(`log submit failed=${submitError instanceof Error ? submitError.message : String(submitError)}`)
      setStatus('Test lỗi và chưa lưu được log.')
    }
  } finally {
    try {
      toneGain?.gain.setValueAtTime(0, toneContext?.currentTime ?? 0)
      toneOscillator?.stop()
    } catch {}
    try {
      toneMediaTrack?.stop()
    } catch {}
    try {
      await deviceRoom?.disconnect?.()
    } catch {}
    try {
      await botRoom?.disconnect?.()
    } catch {}
    try {
      if (toneContext && toneContext.state !== 'closed') await toneContext.close()
    } catch {}
    outputEl.srcObject = null
    running = false
    startButton.disabled = false
  }
}

startButton.addEventListener('click', () => {
  void runLab()
})
