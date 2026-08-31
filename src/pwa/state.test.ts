import { describe, expect, it } from 'vitest'
import { derivePwaState, versionsAligned } from './state'

describe('PWA runtime state', () => {
  it('tracks control, pending update, SW phase and build id', () => {
    expect(derivePwaState({ controlled: true, updatePending: true, phase: 'waiting', swBuildId: 'abc123' })).toEqual({
      controlled: true,
      updatePending: true,
      phase: 'waiting',
      swBuildId: 'abc123',
    })
  })

  it('detects UI and service-worker build mismatches', () => {
    expect(versionsAligned('abc123', 'abc123')).toBe(true)
    expect(versionsAligned('abc123', 'def456')).toBe(false)
    expect(versionsAligned('abc123', null)).toBe(true)
  })
})
