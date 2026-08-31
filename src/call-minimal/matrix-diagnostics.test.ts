import { describe, expect, it } from 'vitest'
import { classifyMatrixResult, primeDiagnosticAudioContext } from './matrix-diagnostics'

describe('matrix diagnostics', () => {
  it('calls AudioContext.resume synchronously when the matrix run starts', () => {
    let resumeCalls = 0
    const fakeContext = {
      state: 'suspended',
      resume: () => {
        resumeCalls += 1
        return Promise.resolve()
      },
    }

    const primed = primeDiagnosticAudioContext(() => fakeContext)

    expect(resumeCalls).toBe(1)
    expect(primed.context).toBe(fakeContext)
  })

  it('does not call zero energy a mic failure while the meter is suspended', () => {
    expect(classifyMatrixResult({
      meterState: 'suspended',
      localEnergy: 0,
      outboundBytes: 2615,
      inboundBytes: 0,
    })).toBe('inconclusive')
  })

  it('can fail zero-energy mic only when the meter is actually running', () => {
    expect(classifyMatrixResult({
      meterState: 'running',
      localEnergy: 0,
      outboundBytes: 2615,
      inboundBytes: 0,
    })).toBe('fail')
  })
})
