import { describe, expect, it } from 'vitest'
import { VoiceRecorderSession, type VoiceRecorderBrowser, type VoiceRecorderLike } from './voice-recorder'

class FakeRecorder implements VoiceRecorderLike {
  state = 'inactive'
  mimeType = 'audio/webm'
  stopCalls = 0
  private listeners = new Map<string, Array<(event: { data?: Blob }) => void>>()

  addEventListener(type: 'dataavailable' | 'stop', listener: (event: { data?: Blob }) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  start(): void {
    this.state = 'recording'
  }

  stop(): void {
    this.stopCalls += 1
    this.state = 'inactive'
    for (const listener of this.listeners.get('dataavailable') ?? []) listener({ data: new Blob(['voice'], { type: this.mimeType }) })
    for (const listener of this.listeners.get('stop') ?? []) listener({})
  }
}

describe('VoiceRecorderSession', () => {
  it('records outside LiveKit and returns an audio File while stopping the mic track', async () => {
    let trackStopped = false
    const recorder = new FakeRecorder()
    const browser: VoiceRecorderBrowser = {
      async acquire() {
        return {
          recorder,
          stopTracks() { trackStopped = true },
        }
      },
      now: (() => {
        let value = 1000
        return () => (value += 500)
      })(),
    }

    const session = new VoiceRecorderSession(browser)
    await session.start()
    expect(session.isRecording()).toBe(true)

    const result = await session.stop()
    expect(result.file.type).toBe('audio/webm')
    expect(result.file.size).toBeGreaterThan(0)
    expect(result.durationMs).toBe(500)
    expect(trackStopped).toBe(true)
    expect(session.isRecording()).toBe(false)
  })

  it('cancels an active recording by stopping recorder and mic without returning a file', async () => {
    let trackStopped = false
    const recorder = new FakeRecorder()
    const browser: VoiceRecorderBrowser = {
      async acquire() {
        return {
          recorder,
          stopTracks() { trackStopped = true },
        }
      },
      now: () => 1000,
    }

    const session = new VoiceRecorderSession(browser)
    await session.start()
    expect(session.isRecording()).toBe(true)

    await session.cancel()

    expect(recorder.stopCalls).toBe(1)
    expect(trackStopped).toBe(true)
    expect(session.isRecording()).toBe(false)
  })
})
