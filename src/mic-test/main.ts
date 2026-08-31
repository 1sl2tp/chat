import { beginPureMicCapture } from './pure-capture'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}

const startButton = required<HTMLButtonElement>('#start')
const stopButton = required<HTMLButtonElement>('#stop')
const permissionEl = required<HTMLElement>('#permission')
const trackEl = required<HTMLElement>('#track')
const recorderEl = required<HTMLElement>('#recorder-state')
const playbackEl = required<HTMLAudioElement>('#playback')
const playbackNoteEl = required<HTMLElement>('#playback-note')
const verdictEl = required<HTMLElement>('#verdict')
const versionEl = required<HTMLElement>('#version')

versionEl.textContent = `mic-test-pure-gum · build ${(import.meta.env.VITE_BUILD_ID ?? 'local').slice(0, 7)}`

let stream: MediaStream | null = null
let recorder: MediaRecorder | null = null
let stopTimer = 0
let playbackUrl: string | null = null

function setVerdict(text: string, state: 'idle' | 'ok' | 'bad' = 'idle'): void {
  verdictEl.textContent = text
  verdictEl.dataset.state = state
}

function clearPlayback(): void {
  if (playbackUrl) URL.revokeObjectURL(playbackUrl)
  playbackUrl = null
  playbackEl.removeAttribute('src')
  playbackEl.load()
  playbackEl.hidden = true
  playbackNoteEl.textContent = 'Chưa có bản ghi.'
}

function stopProbe(): void {
  if (stopTimer) window.clearTimeout(stopTimer)
  stopTimer = 0
  if (recorder?.state === 'recording') recorder.stop()
  recorder = null
  for (const track of stream?.getTracks() ?? []) track.stop()
  stream = null
  startButton.disabled = false
  stopButton.disabled = true
}

function startRecorder(nextStream: MediaStream): void {
  if (typeof MediaRecorder === 'undefined') throw new Error('media_recorder_unsupported')

  const chunks: BlobPart[] = []
  const nextRecorder = new MediaRecorder(nextStream)
  recorder = nextRecorder
  recorderEl.textContent = 'recording 3s…'
  playbackNoteEl.textContent = 'Đang ghi đúng stream vừa được getUserMedia trả về…'

  nextRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  nextRecorder.onerror = () => {
    recorderEl.textContent = 'error'
    setVerdict('MediaRecorder lỗi khi ghi stream mic', 'bad')
  }

  nextRecorder.onstop = () => {
    const mimeType = nextRecorder.mimeType || 'audio/mp4'
    const blob = new Blob(chunks, { type: mimeType })
    clearPlayback()
    playbackUrl = URL.createObjectURL(blob)
    playbackEl.src = playbackUrl
    playbackEl.hidden = false
    recorderEl.textContent = `done · ${blob.size} bytes`
    playbackNoteEl.textContent = 'Bấm Play và nghe. Nếu im thì chính stream getUserMedia đang im.'
    setVerdict('Đã ghi xong 3 giây — bấm Play để kiểm tra', 'idle')
  }

  nextRecorder.start()
  stopTimer = window.setTimeout(() => {
    stopTimer = 0
    if (nextRecorder.state === 'recording') nextRecorder.stop()
  }, 3000)
}

startButton.addEventListener('click', () => {
  stopProbe()
  clearPlayback()
  permissionEl.textContent = 'requesting…'
  trackEl.textContent = '—'
  recorderEl.textContent = '—'
  setVerdict('Đang gọi getUserMedia trực tiếp…')

  if (!navigator.mediaDevices?.getUserMedia) {
    permissionEl.textContent = 'unsupported'
    setVerdict('Trình duyệt không hỗ trợ getUserMedia', 'bad')
    return
  }

  // Không AudioContext, không analyser, không network. Đây là media call đầu tiên trong cú bấm.
  const capturePromise = beginPureMicCapture({
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  })

  void capturePromise.then((nextStream) => {
    stream = nextStream
    permissionEl.textContent = 'granted'
    const track = nextStream.getAudioTracks()[0]
    if (!track) throw new Error('audio_track_missing')
    trackEl.textContent = `${track.readyState} · enabled=${track.enabled} · muted=${track.muted}`
    startButton.disabled = true
    stopButton.disabled = false
    setVerdict('Mic đã mở — đang ghi 3 giây…')
    startRecorder(nextStream)
  }).catch((error) => {
    const name = error instanceof DOMException ? error.name : 'Error'
    const message = error instanceof Error ? error.message : String(error)
    permissionEl.textContent = name === 'NotAllowedError' ? 'denied / blocked' : 'error'
    recorderEl.textContent = '—'
    setVerdict(`${name}: ${message}`, 'bad')
    stopProbe()
  })
})

stopButton.addEventListener('click', () => {
  stopProbe()
  setVerdict('Đã dừng')
})
