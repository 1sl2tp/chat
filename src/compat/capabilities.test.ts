import { describe, expect, it } from 'vitest'
import { detectCapabilities } from './capabilities'

describe('feature capability detection', () => {
  it('reports the browser features that control app behavior', () => {
    const getUserMedia = () => Promise.resolve({})
    const setSinkId = () => Promise.resolve()

    expect(detectCapabilities({
      serviceWorker: {},
      Notification: function Notification() {},
      mediaDevices: { getUserMedia },
      RTCPeerConnection: function RTCPeerConnection() {},
      setSinkId,
      PushManager: function PushManager() {},
      setAppBadge: () => Promise.resolve(),
      mediaSession: {},
      requestPictureInPicture: () => Promise.resolve(),
      documentPictureInPicture: {},
      wakeLock: {},
    })).toEqual({
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
    })
  })

  it('returns false instead of guessing when a feature is unavailable', () => {
    expect(detectCapabilities({})).toEqual({
      serviceWorker: false,
      notifications: false,
      mediaDevices: false,
      getUserMedia: false,
      peerConnection: false,
      audioOutputSelection: false,
      pushManager: false,
      appBadge: false,
      mediaSession: false,
      videoPictureInPicture: false,
      documentPictureInPicture: false,
      wakeLock: false,
    })
  })
})
