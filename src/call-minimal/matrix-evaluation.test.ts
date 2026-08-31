import { describe, expect, it } from 'vitest'
import { diagnoseMatrixPath } from './matrix-evaluation'

describe('diagnoseMatrixPath', () => {
  it('identifies capture failure when local mic energy is silent', () => {
    expect(diagnoseMatrixPath({ localEnergy: 0.00001, outboundBytes: 8000, remoteEnergy: 0 }))
      .toBe('local-capture-silent')
  })

  it('identifies transport failure when local mic is alive but remote energy is silent', () => {
    expect(diagnoseMatrixPath({ localEnergy: 0.03, outboundBytes: 12000, remoteEnergy: 0.00000001 }))
      .toBe('transport-or-encode')
  })

  it('passes when local and remote audio both have meaningful energy', () => {
    expect(diagnoseMatrixPath({ localEnergy: 0.03, outboundBytes: 12000, remoteEnergy: 0.02 }))
      .toBe('audio-alive')
  })
})
