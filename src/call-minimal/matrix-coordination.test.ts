import { describe, expect, it } from 'vitest'
import { shouldLeadMatrix, matrixRunKey } from './matrix-coordination'

describe('matrix coordination', () => {
  it('uses the same deterministic leader on both devices', () => {
    expect(shouldLeadMatrix('ios-b', 'android-a')).toBe(false)
    expect(shouldLeadMatrix('android-a', 'ios-b')).toBe(true)
  })

  it('creates a v1.5-scoped run key', () => {
    expect(matrixRunKey('abc')).toBe('v15-abc')
  })
})
