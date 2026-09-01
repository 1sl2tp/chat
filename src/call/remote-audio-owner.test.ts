import { describe, expect, it } from 'vitest'
import { createOwnedRemoteAudio } from './remote-audio-owner'

describe('remote audio owner', () => {
  it('binds the LiveKit MediaStreamTrack to an app-owned audio element', () => {
    const track = { kind: 'audio' } as MediaStreamTrack
    const element = {
      autoplay: false,
      playsInline: false,
      srcObject: null,
    } as unknown as HTMLAudioElement
    let streamTracks: MediaStreamTrack[] = []
    const stream = {} as MediaStream

    const result = createOwnedRemoteAudio(track, {
      createAudio: () => element,
      createStream: (tracks) => {
        streamTracks = tracks
        return stream
      },
    })

    expect(result).toBe(element)
    expect(streamTracks).toEqual([track])
    expect(element.srcObject).toBe(stream)
    expect(element.autoplay).toBe(true)
    expect(element.playsInline).toBe(true)
  })
})
