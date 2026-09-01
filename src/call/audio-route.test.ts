import { describe, expect, it } from 'vitest'
import { resetCallAudioRoute, routeCallToReceiverAfterMicrophone } from './audio-route'

describe('call audio route', () => {
  it('uses play-and-record for the phone receiver route', () => {
    const audioSession = { type: 'auto' }

    expect(routeCallToReceiverAfterMicrophone({ audioSession })).toBe(true)
    expect(audioSession.type).toBe('play-and-record')
  })

  it('resets playback routing after the call ends', () => {
    const writes: string[] = []
    let value = 'play-and-record'
    const audioSession = {
      get type() { return value },
      set type(next: string) {
        writes.push(next)
        value = next
      },
    }

    expect(resetCallAudioRoute({ audioSession })).toBe(true)
    expect(writes).toEqual(['playback', 'auto'])
    expect(audioSession.type).toBe('auto')
  })

  it('is a no-op when Audio Session API is unavailable', () => {
    expect(routeCallToReceiverAfterMicrophone({})).toBe(false)
    expect(resetCallAudioRoute({})).toBe(false)
  })
})
