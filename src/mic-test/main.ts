import { beginPureMicCaptureFirst } from './pure-capture'

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

versionEl.textContent = `mic-test-gum-first · build ${(import.meta.env.VITE_BUILD_ID ?? 'local').slice(0, 7)}`

let stream: MediaStream | null = null
let recorder: MediaRecorder | null = null
let stopTimer = 0
let playbackUrl: string | null = null

function setVerdict(text: string, state: 'idle' | 'ok' | 'bad' = 'idle'): void {
  verdictEl.textContent = text
  verdictEl.dataset.state = state
}

function clearPlaybackAfterCapture(): void {
  if (playbackUrl) URL.revokeObjectURL(playbackUrl)
  playbackUrl = null
  playbackEl.removeAttribute('src')
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
  recorderEl.textContent = 'gUM OK · tạo MediaRecorder…'
  if (typeof MediaRecorder === 'undefined') throw new Error('media_recorder_unsupported')

  const chunks: BlobPart[] = []
  let nextRecorder: MediaRecorder
  try {
    nextRecorder = new MediaRecorder(nextStream)
  } catch (error) {
    const name = error instanceof DOMException ? error.name : 'Error'
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`media_recorder_create:${name}:${message}`)
  }

  recorder = nextRecorder
  recorderEl.textContent = 'MediaRecorder OK · start…'

  nextRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  nextRecorder.onerror = () => {
    recorderEl.textContent = 'MediaRecorder runtime error'
    setVerdict('MediaRecorder lỗi trong lúc ghi stream', 'bad')
  }

  nextRecorder.onstop = () => {
    const mimeType = nextRecorder.mimeType || 'audio/mp4'
    const blob = new Blob(chunks, { type: mimeType })
    if (playbackUrl) URL.revokeObjectURL(playbackUrl)
    playbackUrl = URL.createObjectURL(blob)
    playbackEl.src = playbackUrl
    playbackEl.hidden = false
    recorderEl.textContent = `done · ${blob.size} bytes · ${mimeType}`
    playbackNoteEl.textContent = 'Bấm Play và nghe. Nếu im thì đúng stream gUM đang im.'
    setVerdict('Đã ghi xong 3 giây — bấm Play để kiểm tra', 'idle')
  }

  try {
    nextRecorder.start()
  } catch (error) {
    const name = error instanceof DOMException ? error.name : 'Error'
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`media_recorder_start:${name}:${message}`)
  }

  // Chỉ sau khi gUM đã resolve VÀ recorder đã start mới chạm tới audio element cũ.
  clearPlaybackAfterCapture()
  recorderEl.textContent = 'recording 3s…'
  playbackNoteEl.textContent = 'Đang ghi đúng stream getUserMedia vừa trả về…'

  stopTimer = window.setTimeout(() => {
    stopTimer = 0
    if (nextRecorder.state === 'recording') nextRecorder.stop()
  }, 3000)
}

startButton.addEventListener('click', () => {
  if (stream || recorder) return

  permissionEl.textContent = 'requesting…'
  trackEl.textContent = '—'
  recorderEl.textContent = '—'
  setVerdict('Bước 1/3: gọi getUserMedia trực tiếp…')

  if (!navigator.mediaDevices?.getUserMedia) {
    permissionEl.textContent = 'unsupported'
    setVerdict('Trình duyệt không hỗ trợ getUserMedia', 'bad')
    return
  }

  // TUYỆT ĐỐI không gọi AudioContext/audio.load()/MediaRecorder trước dòng này.
  const capturePromise = beginPureMicCaptureFirst({
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    afterCapture: (nextStream) => {
      stream = nextStream
      permissionEl.textContent = 'granted'
      const track = nextStream.getAudioTracks()[0]
      if (!track) throw new Error('audio_track_missing')
      trackEl.textContent = `${track.readyState} · enabled=${track.enabled} · muted=${track.muted}`
      startButton.disabled = true
      stopButton.disabled = false
      setVerdict('Bước 2/3: gUM OK — bắt đầu MediaRecorder…')
      startRecorder(nextStream)
    },
  })

  void capturePromise.catch((error) => {
    const name = error instanceof DOMException ? error.name : 'Error'
    const message = error instanceof Error ? error.message : String(error)
    permissionEl.textContent = name === 'NotAllowedError' ? 'denied / blocked' : permissionEl.textContent
    recorderEl.textContent = recorderEl.textContent === '—' ? 'chưa tạo' : recorderEl.textContent
    setVerdict(`${name}: ${message}`, 'bad')
    stopProbe()
  })
})

stopButton.addEventListener('click', () => {
  stopProbe()
  setVerdict('Đã dừng')
})
