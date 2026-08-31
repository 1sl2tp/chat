import { describe, expect, it } from 'vitest'
import { decodeProfileReady, encodeProfileReady, peerReadyForProfile } from './matrix-sync'

describe('matrix profile synchronization', () => {
  it('round trips a profile readiness message', () => {
    expect(decodeProfileReady(encodeProfileReady('native-p2p'))).toEqual({ type: 'matrix-profile-ready', profile: 'native-p2p' })
  })

  it('rejects retired or malformed profile messages', () => {
    expect(decodeProfileReady(new TextEncoder().encode('{"type":"matrix-profile-ready","profile":"ios-explicit-track"}'))).toBeNull()
    expect(decodeProfileReady(new TextEncoder().encode('bad'))).toBeNull()
  })

  it('releases only when a currently connected peer reports the same profile', () => {
    const reports = new Map<string, string>([['android-1', 'native-p2p'], ['old-peer', 'native-livekit']])
    expect(peerReadyForProfile(['android-1'], reports, 'native-p2p')).toBe(true)
    expect(peerReadyForProfile(['android-1'], reports, 'native-livekit')).toBe(false)
  })
})
