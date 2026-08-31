import { describe, expect, it } from 'vitest'
import { captureOptionsForUserAgent } from './capture-profile'

describe('captureOptionsForUserAgent', () => {
  it('disables voiceIsolation only for iOS Web', () => {
    const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'
    expect(captureOptionsForUserAgent(ios)).toEqual({ voiceIsolation: false })
  })

  it('keeps LiveKit defaults on Android', () => {
    const android = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/147.0 Mobile Safari/537.36'
    expect(captureOptionsForUserAgent(android)).toBeUndefined()
  })
})
