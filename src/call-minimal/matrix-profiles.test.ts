import { describe, expect, it } from 'vitest'
import { MATRIX_PROFILE_IDS, matrixProfileLabel, nextMatrixProfileAt } from './matrix-profiles'

describe('v1.5 auto matrix profiles', () => {
  it('runs only the four approved distinct engines in a stable order', () => {
    expect(MATRIX_PROFILE_IDS).toEqual([
      'native-livekit',
      'native-p2p',
      'webaudio-bridge',
      'livekit-precapture',
    ])
    expect(MATRIX_PROFILE_IDS).not.toContain('ios-audio-session')
    expect(MATRIX_PROFILE_IDS).not.toContain('ios-explicit-track')
  })

  it('uses short labels that identify the real transport path', () => {
    expect(matrixProfileLabel('native-livekit')).toBe('Native → LiveKit')
    expect(matrixProfileLabel('native-p2p')).toBe('Native P2P')
    expect(matrixProfileLabel('webaudio-bridge')).toBe('WebAudio Bridge')
    expect(matrixProfileLabel('livekit-precapture')).toBe('LiveKit Pre-capture')
  })

  it('schedules each profile after the previous run plus cleanup gap', () => {
    expect(nextMatrixProfileAt(1_000, 0, 12_000, 3_000)).toBe(1_000)
    expect(nextMatrixProfileAt(1_000, 1, 12_000, 3_000)).toBe(16_000)
    expect(nextMatrixProfileAt(1_000, 3, 12_000, 3_000)).toBe(46_000)
  })
})
