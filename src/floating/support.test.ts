import { describe, expect, it } from 'vitest'
import { deriveFloatingSupport } from './support'

describe('floating call support contract', () => {
  it('prefers document PiP when available but always keeps an in-app mini call fallback', () => {
    expect(deriveFloatingSupport({
      serviceWorker: true,
      notifications: true,
      mediaDevices: true,
      getUserMedia: true,
      peerConnection: true,
      audioOutputSelection: true,
      pushManager: true,
      appBadge: true,
      mediaSession: true,
      videoPictureInPicture: true,
      documentPictureInPicture: true,
      wakeLock: true,
    })).toEqual({
      documentPictureInPicture: true,
      videoPictureInPicture: true,
      mediaSession: true,
      wakeLock: true,
      inAppMiniCall: true,
    })
  })

  it('falls back cleanly when the platform has no PiP API', () => {
    expect(deriveFloatingSupport({
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
      wakeLock: false,
    })).toEqual({
      documentPictureInPicture: false,
      videoPictureInPicture: false,
      mediaSession: true,
      wakeLock: false,
      inAppMiniCall: true,
    })
  })
})
