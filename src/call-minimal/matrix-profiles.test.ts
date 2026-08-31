import { describe, expect, it } from 'vitest'
import { MATRIX_PROFILES, nextMatrixProfile } from './matrix-profiles'

describe('v1.6 iOS capture recovery matrix', () => {
  it('contains only the three new recovery paths', () => {
    expect(MATRIX_PROFILES.map((profile) => profile.id)).toEqual([
      'webkit-reroute',
      'webkit-reset-reroute',
      'raw-mic-reroute',
    ])
    expect(MATRIX_PROFILES.every((profile) => profile.transport === 'livekit')).toBe(true)
  })

  it('does not return any retired v1.5 diagnostic path', () => {
    expect(nextMatrixProfile('webkit-reroute')?.id).toBe('webkit-reset-reroute')
    expect(nextMatrixProfile('webkit-reset-reroute')?.id).toBe('raw-mic-reroute')
    expect(nextMatrixProfile('raw-mic-reroute')).toBeUndefined()
  })
})
