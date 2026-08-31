import { describe, expect, it } from 'vitest'
import { scoreAudioLab, type AudioLabMeasuredMetrics } from './scoring'

function metrics(overrides: Partial<AudioLabMeasuredMetrics> = {}): AudioLabMeasuredMetrics {
  return {
    micSenderBytesDelta: 5000,
    botMicReceiverBytesDelta: 4800,
    botToneSenderBytesDelta: 6000,
    deviceToneReceiverBytesDelta: 5900,
    deviceToneEnergyDelta: 0.5,
    baselineMicEnergyDelta: 0.002,
    toneMicEnergyDelta: 0.01,
    playbackApiPlaying: true,
    ...overrides,
  }
}

describe('scoreAudioLab', () => {
  it('passes when both LiveKit directions carry audio and playback is active', () => {
    const result = scoreAudioLab(metrics())
    expect(result.overallStatus).toBe('pass')
    expect(result.micTransport).toBe('pass')
    expect(result.remoteTransport).toBe('pass')
    expect(result.playbackPipeline).toBe('pass')
    expect(result.physicalOutputRoute).toBe('unverified')
  })

  it('fails when the device microphone is not received by the bot participant', () => {
    const result = scoreAudioLab(metrics({ botMicReceiverBytesDelta: 0 }))
    expect(result.overallStatus).toBe('fail')
    expect(result.micTransport).toBe('fail')
  })

  it('fails when the bot tone does not reach the device', () => {
    const result = scoreAudioLab(metrics({ deviceToneReceiverBytesDelta: 0, deviceToneEnergyDelta: 0 }))
    expect(result.overallStatus).toBe('fail')
    expect(result.remoteTransport).toBe('fail')
  })

  it('fails the playback pipeline when HTML audio is not actually playing', () => {
    const result = scoreAudioLab(metrics({ playbackApiPlaying: false }))
    expect(result.overallStatus).toBe('fail')
    expect(result.playbackPipeline).toBe('fail')
  })

  it('marks a high echo-return heuristic without pretending physical routing is verified', () => {
    const result = scoreAudioLab(metrics({ baselineMicEnergyDelta: 0.001, toneMicEnergyDelta: 0.2, deviceToneEnergyDelta: 0.4 }))
    expect(result.echoReturn).toBe('high')
    expect(result.physicalOutputRoute).toBe('unverified')
  })
})
