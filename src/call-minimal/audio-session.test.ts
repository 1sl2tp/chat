import { describe, expect, it } from 'vitest'
import { activateCallAudioSessionAfterCapture, prepareCallAudioSession } from './audio-session'

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.6 Mobile/15E148 Safari/604.1'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/147.0 Mobile Safari/537.36'

describe('iOS AudioSession ordering', () => {
  it('returns iOS AudioSession to auto before microphone capture', () => {
    const audioSession = { type: 'play-and-record' }

    const prepared = prepareCallAudioSession(IOS_UA, { audioSession })

    expect(prepared).toBe(true)
    expect(audioSession.type).toBe('auto')
  })

  it('switches iOS AudioSession to play-and-record only after capture has started', () => {
    const audioSession = { type: 'auto' }

    const activated = activateCallAudioSessionAfterCapture(IOS_UA, { audioSession })

    expect(activated).toBe(true)
    expect(audioSession.type).toBe('play-and-record')
  })

  it('does not change Android audio session behavior', () => {
    const audioSession = { type: 'auto' }

    expect(prepareCallAudioSession(ANDROID_UA, { audioSession })).toBe(false)
    expect(activateCallAudioSessionAfterCapture(ANDROID_UA, { audioSession })).toBe(false)
    expect(audioSession.type).toBe('auto')
  })

  it('is safe on iOS browsers without AudioSession API', () => {
    expect(prepareCallAudioSession(IOS_UA, {})).toBe(false)
    expect(activateCallAudioSessionAfterCapture(IOS_UA, {})).toBe(false)
  })
})
