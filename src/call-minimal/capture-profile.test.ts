import { describe, expect, it } from 'vitest'
import { captureProfileForUserAgent } from './capture-profile'

describe('captureProfileForUserAgent', () => {
  it('uses an explicit mono speech track on iOS with voiceIsolation disabled', () => {
    const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'
    expect(captureProfileForUserAgent(ios)).toEqual({
      mode: 'explicit',
      options: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        voiceIsolation: false,
      },
    })
  })

  it('keeps Android on the existing LiveKit default microphone path', () => {
    const android = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/147.0 Mobile Safari/537.36'
    expect(captureProfileForUserAgent(android)).toEqual({ mode: 'default' })
  })
})
