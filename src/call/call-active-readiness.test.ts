import { describe, expect, it } from 'vitest'
import { CallMediaReadyGate } from './livekit-media'
import { connectedAtForPolling } from './voice-session'

describe('call active readiness', () => {
  it('waits for both local microphone publish and remote audio subscription', () => {
    const gate = new CallMediaReadyGate()

    expect(gate.markLocalPublished()).toBe(false)
    expect(gate.markRemoteAudioSubscribed()).toBe(true)
    expect(gate.markRemoteAudioSubscribed()).toBe(false)
  })

  it('also works when remote audio arrives before local microphone publish', () => {
    const gate = new CallMediaReadyGate()

    expect(gate.markRemoteAudioSubscribed()).toBe(false)
    expect(gate.markLocalPublished()).toBe(true)
    expect(gate.markLocalPublished()).toBe(false)
  })

  it('preserves a local timer anchor instead of replacing it with server wall clock', () => {
    expect(connectedAtForPolling(10_000, '1970-01-01T00:00:01.000Z', 20_000)).toBe(10_000)
    expect(connectedAtForPolling(null, null, 20_000)).toBe(20_000)
  })
})
