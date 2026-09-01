import { describe, expect, it } from 'vitest'
import { connectedAtForPolling } from './voice-session'

describe('live call timer clock domain', () => {
  it('starts from local now instead of a server wall-clock timestamp', () => {
    const localNow = 1_000_000
    expect(connectedAtForPolling(null, localNow)).toBe(localNow)
  })

  it('preserves the existing local start when polling connected state', () => {
    const localStartedAt = 1_000_000
    expect(connectedAtForPolling(localStartedAt, 1_015_000)).toBe(localStartedAt)
  })
})
