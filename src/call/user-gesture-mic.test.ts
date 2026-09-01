import { describe, expect, it } from 'vitest'
import {
  beginCallMicrophoneCapture,
  publishCapturedMicrophone,
  waitForCapturedMicrophone,
} from './user-gesture-mic'

describe('call microphone capture', () => {
  it('starts getUserMedia synchronously with audio only', async () => {
    const events: string[] = []
    let resolveStream!: (stream: MediaStream) => void
    const pendingStream = new Promise<MediaStream>((resolve) => { resolveStream = resolve })

    const pending = beginCallMicrophoneCapture({
      getUserMedia: (constraints) => {
        events.push(JSON.stringify(constraints))
        return pendingStream
      },
    })

    expect(events).toEqual(['{"audio":true,"video":false}'])

    const stream = {} as MediaStream
    resolveStream(stream)
    await expect(pending).resolves.toBe(stream)
  })

  it('waits for the pending user-gesture capture before LiveKit continues', async () => {
    let resolveStream!: (stream: MediaStream) => void
    const pending = new Promise<MediaStream>((resolve) => { resolveStream = resolve })
    const stream = {} as MediaStream

    const result = waitForCapturedMicrophone(null, pending)
    resolveStream(stream)

    await expect(result).resolves.toBe(stream)
  })

  it('rejects when no user-gesture microphone capture exists', async () => {
    await expect(waitForCapturedMicrophone(null, null)).rejects.toThrow('microphone_not_prepared')
  })

  it('publishes the exact captured audio track as microphone source', async () => {
    const track = { id: 'ios-mic-track' } as MediaStreamTrack
    const stream = { getAudioTracks: () => [track] } as unknown as MediaStream
    const published: Array<{ track: MediaStreamTrack; source: string }> = []

    const result = await publishCapturedMicrophone(stream, 'microphone', async (nextTrack, options) => {
      published.push({ track: nextTrack, source: options.source })
    })

    expect(result).toBe(track)
    expect(published).toEqual([{ track, source: 'microphone' }])
  })
})
