import { describe, expect, it } from 'vitest'
import { connectedAtForPolling } from './voice-session'

describe('live call timer clock domain', () => {
  it('uses the authoritative connected timestamp when there is no local start yet', () => {
    const serverConnectedAt = 1_000_000
    expect(connectedAtForPolling(null, serverConnectedAt)).toBe(serverConnectedAt)
  })

  it('replaces a device-local start with the authoritative server connected timestamp', () => {
    const localStartedAt = 1_000_000
    const serverConnectedAt = 990_000
    expect(connectedAtForPolling(localStartedAt, serverConnectedAt)).toBe(serverConnectedAt)
  })
})
