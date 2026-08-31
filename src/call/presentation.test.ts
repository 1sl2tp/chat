import { describe, expect, it } from 'vitest'
import { compactModeFor, formatCallDuration } from './presentation'

describe('call presentation', () => {
  it('uses a top bar for audio and picture-in-picture for video', () => {
    expect(compactModeFor('audio')).toBe('top')
    expect(compactModeFor('video')).toBe('pip')
  })

  it('formats connected duration as mm:ss', () => {
    expect(formatCallDuration(0)).toBe('00:00')
    expect(formatCallDuration(65_000)).toBe('01:05')
  })
})
