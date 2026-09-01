import { describe, expect, it } from 'vitest'
import { setPhoneAudioRoute } from './audio-route-control'

describe('phone audio route control', () => {
  it('switches iPhone voice playback between receiver and speaker', () => {
    const audioSession = { type: 'auto' }

    expect(setPhoneAudioRoute({ audioSession }, 'receiver')).toEqual({ ok: true, route: 'receiver' })
    expect(audioSession.type).toBe('play-and-record')

    expect(setPhoneAudioRoute({ audioSession }, 'speaker')).toEqual({ ok: true, route: 'speaker' })
    expect(audioSession.type).toBe('playback')
  })

  it('reports unsupported instead of pretending the route changed', () => {
    expect(setPhoneAudioRoute({}, 'speaker')).toEqual({ ok: false, route: 'unsupported' })
  })
})
