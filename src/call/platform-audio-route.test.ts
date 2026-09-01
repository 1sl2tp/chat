import { describe, expect, it } from 'vitest'
import { defaultCallRouteForWeb } from './platform-audio-route'

describe('platform call audio route', () => {
  it('treats Android Chrome WebRTC as speakerphone by default', () => {
    expect(defaultCallRouteForWeb('Mozilla/5.0 (Linux; Android 16; Pixel) AppleWebKit Chrome/150')).toBe('speaker')
  })

  it('keeps iPhone call intent on receiver', () => {
    expect(defaultCallRouteForWeb('Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit Safari')).toBe('receiver')
  })

  it('does not guess a phone route on desktop', () => {
    expect(defaultCallRouteForWeb('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit Safari')).toBe('system')
  })
})
