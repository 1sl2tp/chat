import type { CapabilitySnapshot } from '../compat/capabilities'

export interface FloatingSupport {
  documentPictureInPicture: boolean
  videoPictureInPicture: boolean
  mediaSession: boolean
  wakeLock: boolean
  inAppMiniCall: true
}

export function deriveFloatingSupport(capabilities: CapabilitySnapshot): FloatingSupport {
  return {
    documentPictureInPicture: capabilities.documentPictureInPicture,
    videoPictureInPicture: capabilities.videoPictureInPicture,
    mediaSession: capabilities.mediaSession,
    wakeLock: capabilities.wakeLock,
    inAppMiniCall: true,
  }
}
