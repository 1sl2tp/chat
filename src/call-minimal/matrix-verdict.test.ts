import { describe, expect, it } from 'vitest'
import { evaluateMatrixVerdict } from './matrix-verdict'

describe('evaluateMatrixVerdict', () => {
  it('fails when the local microphone itself is silent', () => {
    expect(evaluateMatrixVerdict({ localEnergy: 0.0001, outboundBytes: 9000, inboundBytes: 9000, inboundEnergy: 0.02 })).toBe('fail')
  })

  it('does not pass packets that contain effectively silent audio', () => {
    expect(evaluateMatrixVerdict({ localEnergy: 0.03, outboundBytes: 9000, inboundBytes: 3000, inboundEnergy: 2.5e-8 })).toBe('fail')
  })

  it('is inconclusive when no remote audio arrived at all', () => {
    expect(evaluateMatrixVerdict({ localEnergy: 0.03, outboundBytes: 9000, inboundBytes: 0, inboundEnergy: 0 })).toBe('inconclusive')
  })

  it('passes only with meaningful inbound audio energy', () => {
    expect(evaluateMatrixVerdict({ localEnergy: 0.03, outboundBytes: 9000, inboundBytes: 12000, inboundEnergy: 0.02 })).toBe('pass')
  })
})
