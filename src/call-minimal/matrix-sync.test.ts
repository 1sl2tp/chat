import { describe, expect, it } from 'vitest'
import { decodeProfileReady, encodeProfileReady, peerReadyForProfile } from './matrix-sync'

describe('matrix profile synchronization', () => {
  it('round trips a recovery readiness message', () => {
    expect(decodeProfileReady(encodeProfileReady('webkit-reroute'))).toEqual({ type: 'matrix-profile-ready', profile: 'webkit-reroute' })
  })

  it('rejects retired or malformed profile messages', () => {
    expect(decodeProfileReady(new TextEncoder().encode('{"type":"matrix-profile-ready","profile":"native-p2p"}'))).toBeNull()
    expect(decodeProfileReady(new TextEncoder().encode('bad'))).toBeNull()
  })

  it('releases only when a currently connected peer reports the same recovery', () => {
    const reports = new Map<string, string>([['android-1', 'webkit-reroute'], ['old-peer', 'webkit-reset-reroute']])
    expect(peerReadyForProfile(['android-1'], reports, 'webkit-reroute')).toBe(true)
    expect(peerReadyForProfile(['android-1'], reports, 'webkit-reset-reroute')).toBe(false)
  })
})
