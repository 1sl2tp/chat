import { describe, expect, it } from 'vitest'
import { classifyRuntime } from './runtime'

describe('runtime diagnostics classification', () => {
  it('classifies iPhone Safari as iOS mobile browser', () => {
    expect(classifyRuntime({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
      standalone: false,
    })).toEqual({ os: 'ios', browser: 'safari', formFactor: 'mobile', appMode: 'browser' })
  })

  it('classifies Android Chrome as Android mobile standalone', () => {
    expect(classifyRuntime({
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
      standalone: true,
    })).toEqual({ os: 'android', browser: 'chrome', formFactor: 'mobile', appMode: 'standalone' })
  })

  it('classifies macOS Safari as desktop', () => {
    expect(classifyRuntime({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      standalone: false,
    })).toEqual({ os: 'macos', browser: 'safari', formFactor: 'desktop', appMode: 'browser' })
  })

  it('classifies Windows Edge as desktop', () => {
    expect(classifyRuntime({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      platform: 'Win32',
      maxTouchPoints: 0,
      standalone: false,
    })).toEqual({ os: 'windows', browser: 'edge', formFactor: 'desktop', appMode: 'browser' })
  })
})
