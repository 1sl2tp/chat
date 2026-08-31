import { describe, expect, it } from 'vitest'
import { MATRIX_PROFILES, nextMatrixProfile } from './matrix-profiles'

describe('v1.5 audio matrix', () => {
  it('contains four genuinely distinct diagnostic paths in fixed order', () => {
    expect(MATRIX_PROFILES.map((profile) => profile.id)).toEqual([
      'native-livekit',
      'native-p2p',
      'webaudio-bridge',
      'livekit-precapture',
    ])
    expect(new Set(MATRIX_PROFILES.map((profile) => profile.id)).size).toBe(4)
  })

  it('advances without returning retired v1.3/v1.4 profiles', () => {
    expect(nextMatrixProfile('native-livekit')?.id).toBe('native-p2p')
    expect(nextMatrixProfile('native-p2p')?.id).toBe('webaudio-bridge')
    expect(nextMatrixProfile('webaudio-bridge')?.id).toBe('livekit-precapture')
    expect(nextMatrixProfile('livekit-precapture')).toBeUndefined()
  })
})
