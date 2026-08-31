import { describe, expect, it } from 'vitest'
import { deriveNotificationSupport } from './support'

describe('notification support contract', () => {
  it('derives push, badge, and media-control support from capabilities', () => {
    expect(deriveNotificationSupport({
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
      canPush: true,
      canBadge: true,
      canUseMediaSession: true,
    })
  })

  it('does not claim push without service worker, notifications, and PushManager together', () => {
    expect(deriveNotificationSupport({
      serviceWorker: false,
      notifications: true,
      mediaDevices: true,
      getUserMedia: true,
      peerConnection: true,
      audioOutputSelection: false,
      pushManager: true,
      appBadge: false,
      mediaSession: false,
      videoPictureInPicture: false,
      documentPictureInPicture: false,
      wakeLock: false,
    }).canPush).toBe(false)
  })
})
