import { describe, expect, it, vi } from 'vitest'
import { playRemoteAudioElement } from './audio-playback'

describe('remote audio playback', () => {
  it('marks playing only after media element play resolves', async () => {
    const element = {
      autoplay: false,
      muted: true,
      volume: 0,
      setAttribute: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLMediaElement

    await expect(playRemoteAudioElement(element)).resolves.toBe('playing')
    expect(element.autoplay).toBe(true)
    expect(element.muted).toBe(false)
    expect(element.volume).toBe(1)
    expect(element.play).toHaveBeenCalledTimes(1)
  })

  it('marks blocked when the browser rejects playback', async () => {
    const element = {
      autoplay: false,
      muted: false,
      volume: 1,
      setAttribute: vi.fn(),
      play: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
    } as unknown as HTMLMediaElement

    await expect(playRemoteAudioElement(element)).resolves.toBe('blocked')
  })
})
