import { describe, expect, it, vi } from 'vitest'
import { beginPermissionGestureCapture, grantedAudioTrack } from './permission-gesture'

describe('v1.7 permission gesture capture', () => {
  it('calls getUserMedia synchronously with audio=true before returning the promise', async () => {
    let called = false
    const stream = { getAudioTracks: () => [{ id: 'mic-1' }] } as unknown as MediaStream
    const getUserMedia = vi.fn(() => {
      called = true
      return Promise.resolve(stream)
    })

    const promise = beginPermissionGestureCapture({ getUserMedia })

    expect(called).toBe(true)
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    await expect(promise).resolves.toBe(stream)
  })

  it('returns the exact granted audio track without opening a second capture', () => {
    const track = { id: 'granted-mic' } as MediaStreamTrack
    const stream = { getAudioTracks: () => [track] } as unknown as MediaStream
    expect(grantedAudioTrack(stream)).toBe(track)
  })
})
