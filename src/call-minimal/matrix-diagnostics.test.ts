import { describe, expect, it } from 'vitest'
import { classifyMatrixResult, createMatrixRunSessionId, primeDiagnosticAudioContext } from './matrix-diagnostics'

describe('matrix diagnostics', () => {
  it('creates a UUID suitable for chat_submit_minimal_call_run', () => {
    const id = createMatrixRunSessionId(() => '123e4567-e89b-42d3-a456-426614174000')
    expect(id).toBe('123e4567-e89b-42d3-a456-426614174000')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('calls AudioContext.resume synchronously when the run is started', () => {
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

  it('does not call a zero meter a microphone failure when AudioContext is suspended', () => {
    expect(classifyMatrixResult({
      meterState: 'suspended',
      localEnergy: 0,
      outboundBytes: 2615,
      inboundBytes: 0,
    })).toBe('inconclusive')
  })

  it('can fail a microphone path only when the meter is actually running', () => {
    expect(classifyMatrixResult({
      meterState: 'running',
      localEnergy: 0,
      outboundBytes: 2615,
      inboundBytes: 0,
    })).toBe('fail')
  })
})
