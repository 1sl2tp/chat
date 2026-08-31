import { describe, expect, it } from 'vitest'
import { summarizeMinimalCall, type MinimalCallMetrics } from './summary'

function metrics(overrides: Partial<MinimalCallMetrics> = {}): MinimalCallMetrics {
  return {
    connected: true,
    micTrackLive: true,
    outboundBytesDelta: 1200,
    outboundPacketsDelta: 12,
    remoteTrackSubscribed: true,
    inboundBytesDelta: 1800,
    inboundPacketsDelta: 18,
    playbackStarted: true,
    cleanLeave: true,
    ...overrides,
  }
}

describe('summarizeMinimalCall', () => {
  it('passes a clean two-way LiveKit media session', () => {
    expect(summarizeMinimalCall(metrics())).toEqual({
      overallStatus: 'pass',
      connection: 'pass',
      microphone: 'pass',
      remoteAudio: 'pass',
      playback: 'pass',
      cleanup: 'pass',
    })
  })

  it('fails microphone transport when no outbound RTP was sent', () => {
    expect(summarizeMinimalCall(metrics({ outboundBytesDelta: 0, outboundPacketsDelta: 0 })).microphone).toBe('fail')
  })

  it('is inconclusive for remote audio when no remote participant published audio', () => {
    const result = summarizeMinimalCall(metrics({
      remoteTrackSubscribed: false,
      inboundBytesDelta: 0,
      inboundPacketsDelta: 0,
      playbackStarted: false,
    }))
    expect(result.remoteAudio).toBe('inconclusive')
    expect(result.playback).toBe('inconclusive')
    expect(result.overallStatus).toBe('inconclusive')
  })

  it('fails playback when remote RTP arrived but playback did not start', () => {
    const result = summarizeMinimalCall(metrics({ playbackStarted: false }))
    expect(result.remoteAudio).toBe('pass')
    expect(result.playback).toBe('fail')
    expect(result.overallStatus).toBe('fail')
  })

  it('fails cleanup when the room did not disconnect cleanly', () => {
    expect(summarizeMinimalCall(metrics({ cleanLeave: false })).cleanup).toBe('fail')
  })
})
