import { describe, expect, it } from 'vitest'
import { deriveMediaSupport } from './support'

describe('media support contract', () => {
  it('derives call support from capabilities without OS-specific branching', () => {
    expect(deriveMediaSupport({
      serviceWorker: true,
      notifications: true,
      mediaDevices: true,
      getUserMedia: true,
      peerConnection: true,
      audioOutputSelection: false,
      pushManager: true,
      appBadge: true,
      mediaSession: true,
      videoPictureInPicture: false,
      documentPictureInPicture: false,
      wakeLock: true,
    })).toEqual({
      canCaptureAudio: true,
      canCall: true,
      canSelectAudioOutput: false,
    })
  })

  it('does not claim calling support when microphone capture is unavailable', () => {
    expect(deriveMediaSupport({
      serviceWorker: true,
      notifications: true,
      mediaDevices: true,
      getUserMedia: false,
      peerConnection: true,
      audioOutputSelection: true,
      pushManager: true,
      appBadge: false,
      mediaSession: false,
      videoPictureInPicture: false,
      documentPictureInPicture: false,
      wakeLock: false,
    })).toEqual({
      canCaptureAudio: false,
      canCall: false,
      canSelectAudioOutput: true,
    })
  })
})
