import { describe, expect, it } from 'vitest'
import { rmsFromTimeDomain } from './rms'

describe('local mic RMS', () => {
  it('returns zero for a silent signal', () => {
    expect(rmsFromTimeDomain(new Float32Array([0, 0, 0, 0]))).toBe(0)
  })

  it('returns positive energy for a non-silent signal', () => {
    expect(rmsFromTimeDomain(new Float32Array([0.25, -0.25, 0.25, -0.25]))).toBeGreaterThan(0)
  })
})
