import { describe, expect, it } from 'vitest'
import { requestMicrophoneNow, rmsFromTimeDomain } from './local-mic-probe'

describe('v1.7 local mic probe', () => {
  it('requests the microphone synchronously when the click handler starts', () => {
    let called = false
    const pending = new Promise<MediaStream>(() => {})
    const result = requestMicrophoneNow(() => {
      called = true
      return pending
    })
    expect(called).toBe(true)
    expect(result).toBe(pending)
  })

  it('reports zero for silence and positive RMS for signal', () => {
    expect(rmsFromTimeDomain(new Uint8Array([128, 128, 128, 128]))).toBe(0)
    expect(rmsFromTimeDomain(new Uint8Array([128, 160, 96, 128]))).toBeGreaterThan(0)
  })
})
