import { rmsFromTimeDomain } from './rms'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}

const startButton = required<HTMLButtonElement>('#start')
const stopButton = required<HTMLButtonElement>('#stop')
const permissionEl = required<HTMLElement>('#permission')
const trackEl = required<HTMLElement>('#track')
const contextEl = required<HTMLElement>('#audio-context')
const energyEl = required<HTMLElement>('#energy')
const maxEnergyEl = required<HTMLElement>('#max-energy')
const meterFill = required<HTMLElement>('#meter-fill')
const verdictEl = required<HTMLElement>('#verdict')
const versionEl = required<HTMLElement>('#version')

versionEl.textContent = `mic-test · build ${(import.meta.env.VITE_BUILD_ID ?? 'local').slice(0, 7)}`

let stream: MediaStream | null = null
let context: AudioContext | null = null
let source: MediaStreamAudioSourceNode | null = null
let analyser: AnalyserNode | null = null
let animationFrame = 0
let maxEnergy = 0

function setVerdict(text: string, state: 'idle' | 'ok' | 'bad' = 'idle'): void {
  verdictEl.textContent = text
  verdictEl.dataset.state = state
}

function stopProbe(): void {
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  source?.disconnect()
  source = null
  analyser = null
  for (const track of stream?.getTracks() ?? []) track.stop()
  stream = null
  if (context) void context.close().catch(() => undefined)
  context = null
  startButton.disabled = false
  stopButton.disabled = true
}

function sample(track: MediaStreamTrack): void {
  if (!analyser || !context) return
  const samples = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(samples)
  const energy = rmsFromTimeDomain(samples)
  maxEnergy = Math.max(maxEnergy, energy)

  energyEl.textContent = energy.toFixed(6)
  maxEnergyEl.textContent = maxEnergy.toFixed(6)
  meterFill.style.width = `${Math.min(100, energy * 700)}%`
  contextEl.textContent = context.state
  trackEl.textContent = `${track.readyState} · enabled=${track.enabled} · muted=${track.muted}`

  if (maxEnergy > 0.001) {
    setVerdict('MIC > 0 — Safari đang lấy được tín hiệu mic', 'ok')
  } else {
    setVerdict('Đang đo — hãy nói vào mic…', 'idle')
  }

  animationFrame = requestAnimationFrame(() => sample(track))
}

async function finishStart(
  audioContext: AudioContext,
  resumePromise: Promise<void>,
  micPromise: Promise<MediaStream>,
): Promise<void> {
  try {
    await resumePromise.catch(() => undefined)
    const nextStream = await micPromise
    stream = nextStream
    permissionEl.textContent = 'granted'

    const track = nextStream.getAudioTracks()[0]
    if (!track) throw new Error('audio_track_missing')

    context = audioContext
    if (context.state !== 'running') await context.resume().catch(() => undefined)
    source = context.createMediaStreamSource(nextStream)
    analyser = context.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0
    source.connect(analyser)

    maxEnergy = 0
    startButton.disabled = true
    stopButton.disabled = false
    contextEl.textContent = context.state
    trackEl.textContent = `${track.readyState} · enabled=${track.enabled} · muted=${track.muted}`
    sample(track)

    window.setTimeout(() => {
      if (maxEnergy <= 0.001 && stream) {
        setVerdict('MIC = 0 — quyền đã cấp, track mở nhưng không có tín hiệu', 'bad')
      }
    }, 5000)
  } catch (error) {
    const name = error instanceof DOMException ? error.name : 'Error'
    const message = error instanceof Error ? error.message : String(error)
    permissionEl.textContent = name === 'NotAllowedError' ? 'denied / blocked' : 'error'
    trackEl.textContent = '—'
    contextEl.textContent = audioContext.state
    setVerdict(`${name}: ${message}`, 'bad')
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = null
    if (audioContext.state !== 'closed') void audioContext.close().catch(() => undefined)
    startButton.disabled = false
    stopButton.disabled = true
  }
}

startButton.addEventListener('click', () => {
  stopProbe()
  permissionEl.textContent = 'requesting…'
  trackEl.textContent = '—'
  energyEl.textContent = '0.000000'
  maxEnergyEl.textContent = '0.000000'
  meterFill.style.width = '0%'
  setVerdict('Đang xin quyền mic…')

  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor || !navigator.mediaDevices?.getUserMedia) {
    permissionEl.textContent = 'unsupported'
    setVerdict('Trình duyệt không hỗ trợ getUserMedia/AudioContext', 'bad')
    return
  }

  // Cả AudioContext.resume() và getUserMedia() được kích hoạt trực tiếp trong cùng cú bấm.
  const nextContext = new AudioContextCtor()
  const resumePromise = nextContext.resume()
  const micPromise = navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  void finishStart(nextContext, resumePromise, micPromise)
})

stopButton.addEventListener('click', () => {
  stopProbe()
  setVerdict('Đã dừng')
})
