import { describe, expect, it } from 'vitest'
import { beginPureMicCapture } from './pure-capture'

describe('beginPureMicCapture', () => {
  it('invokes getUserMedia synchronously with audio only', async () => {
    const events: string[] = []
    let resolveStream!: (stream: MediaStream) => void
    const pendingStream = new Promise<MediaStream>((resolve) => { resolveStream = resolve })

    const pending = beginPureMicCapture({
      getUserMedia: (constraints) => {
        events.push(JSON.stringify(constraints))
        return pendingStream
      },
    })

    expect(events).toEqual(['{"audio":true,"video":false}'])

    const stream = { getAudioTracks: () => [{ id: 'mic-1' }] } as unknown as MediaStream
    resolveStream(stream)
    await expect(pending).resolves.toBe(stream)
  })
})
