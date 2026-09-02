export interface VoiceRecorderLike {
  state: string
  mimeType: string
  addEventListener(type: 'dataavailable' | 'stop', listener: (event: { data?: Blob }) => void): void
  start(): void
  stop(): void
}

export interface AcquiredVoiceRecorder {
  recorder: VoiceRecorderLike
  stopTracks(): void
}

export interface VoiceRecorderBrowser {
  acquire(): Promise<AcquiredVoiceRecorder>
  now(): number
}

export interface VoiceRecordingResult {
  file: File
  durationMs: number
}

function extensionForMime(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

export function preferredVoiceMimeType(
  isSupported: (mime: string) => boolean = (mime) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime),
): string {
  for (const mime of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']) {
    if (isSupported(mime)) return mime
  }
  return ''
}

export function createBrowserVoiceRecorder(): VoiceRecorderBrowser {
  return {
    async acquire() {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('voice_recording_unsupported')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })
      const mimeType = preferredVoiceMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      return {
        recorder,
        stopTracks() {
          for (const track of stream.getTracks()) track.stop()
        },
      }
    },
    now: () => Date.now(),
  }
}

export class VoiceRecorderSession {
  private active: AcquiredVoiceRecorder | null = null
  private chunks: Blob[] = []
  private startedAt = 0

  constructor(private readonly browser: VoiceRecorderBrowser = createBrowserVoiceRecorder()) {}

  isRecording(): boolean {
    return this.active?.recorder.state === 'recording'
  }

  async start(): Promise<void> {
    if (this.active) throw new Error('voice_recording_active')
    const acquired = await this.browser.acquire()
    this.active = acquired
    this.chunks = []
    this.startedAt = this.browser.now()
    acquired.recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) this.chunks.push(event.data)
    })
    acquired.recorder.start()
  }

  async stop(): Promise<VoiceRecordingResult> {
    const acquired = this.active
    if (!acquired || acquired.recorder.state !== 'recording') throw new Error('voice_recording_inactive')
    const durationMs = Math.max(0, this.browser.now() - this.startedAt)

    return new Promise<VoiceRecordingResult>((resolve, reject) => {
      acquired.recorder.addEventListener('stop', () => {
        try {
          const mime = acquired.recorder.mimeType || this.chunks[0]?.type || 'audio/webm'
          const file = new File(this.chunks, `voice-${Date.now()}.${extensionForMime(mime)}`, { type: mime })
          resolve({ file, durationMs })
        } catch (error) {
          reject(error)
        } finally {
          acquired.stopTracks()
          this.active = null
          this.chunks = []
          this.startedAt = 0
        }
      })
      acquired.recorder.stop()
    })
  }
}
