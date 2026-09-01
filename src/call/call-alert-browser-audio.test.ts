import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserCallAlertAudio } from './call-alert-controller'

describe('browser call alert audio priming', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('starts a silent audio node during arm so a later incoming ringtone is unlocked', () => {
    const start = vi.fn()
    const stop = vi.fn()
    const connect = vi.fn()
    const disconnect = vi.fn()
    const context = {
      state: 'running',
      currentTime: 1,
      destination: {},
      createOscillator: () => ({
        type: 'sine',
        frequency: { value: 0 },
        connect,
        start,
        stop,
        disconnect,
        addEventListener: vi.fn(),
      }),
      createGain: () => ({ gain: { value: 1 }, connect, disconnect }),
      resume: vi.fn(async () => undefined),
    }
    vi.stubGlobal('window', { AudioContext: function () { return context } })

    const audio = new BrowserCallAlertAudio()
    audio.arm()

    expect(start).toHaveBeenCalledOnce()
    expect(stop).toHaveBeenCalledOnce()
  })
})
