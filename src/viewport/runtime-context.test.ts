import { describe, expect, it } from 'vitest'
import { classifyDisplayMode, classifyPlatform } from './runtime-context'

describe('mobile runtime context', () => {
  it('classifies iOS and Android without exposing a generic isMobile flag', () => {
    expect(classifyPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', 'iPhone', 5)).toBe('ios')
    expect(classifyPlatform('Mozilla/5.0 (Linux; Android 16; Pixel)', 'Linux armv8l', 5)).toBe('android')
    expect(classifyPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 0)).toBe('desktop')
  })

  it('recognizes iPadOS desktop-class user agents through touch capability', () => {
    expect(classifyPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 5)).toBe('ios')
  })

  it('separates browser and installed standalone display modes', () => {
    expect(classifyDisplayMode(false, false)).toBe('browser')
    expect(classifyDisplayMode(true, false)).toBe('standalone')
    expect(classifyDisplayMode(false, true)).toBe('standalone')
  })
})
