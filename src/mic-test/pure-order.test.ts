import { describe, expect, it } from 'vitest'
import { beginPureMicCaptureFirst } from './pure-capture'

describe('beginPureMicCaptureFirst', () => {
  it('does not run post-capture media work before getUserMedia resolves', async () => {
    const events: string[] = []
    let resolveStream!: (stream: MediaStream) => void
    const pendingStream = new Promise<MediaStream>((resolve) => { resolveStream = resolve })

    const pending = beginPureMicCaptureFirst({
      getUserMedia: (constraints) => {
        events.push(`gum:${JSON.stringify(constraints)}`)
        return pendingStream
      },
      afterCapture: () => {
        events.push('after-capture')
      },
    })

    expect(events).toEqual(['gum:{"audio":true,"video":false}'])

    const stream = { getAudioTracks: () => [{ id: 'mic-1' }] } as unknown as MediaStream
    resolveStream(stream)
    await expect(pending).resolves.toBe(stream)
    expect(events).toEqual(['gum:{"audio":true,"video":false}', 'after-capture'])
  })
})
