import { describe, expect, it } from 'vitest'
import { setPhoneAudioRoute } from './audio-route-control'

describe('phone audio route control', () => {
  it('forces receiver by crossing playback before play-and-record', () => {
    const writes: string[] = []
    let current = 'playback'
    const audioSession = {
      get type() { return current },
      set type(next: string) {
        writes.push(next)
        current = next
      },
    }

    expect(setPhoneAudioRoute({ audioSession }, 'receiver')).toEqual({ ok: true, route: 'receiver' })
    expect(writes).toEqual(['playback', 'play-and-record'])
    expect(audioSession.type).toBe('play-and-record')
  })

  it('switches speaker to playback', () => {
    const audioSession = { type: 'play-and-record' }

    expect(setPhoneAudioRoute({ audioSession }, 'speaker')).toEqual({ ok: true, route: 'speaker' })
    expect(audioSession.type).toBe('playback')
  })

  it('reports unsupported instead of pretending the route changed', () => {
    expect(setPhoneAudioRoute({}, 'speaker')).toEqual({ ok: false, route: 'unsupported' })
  })
})
