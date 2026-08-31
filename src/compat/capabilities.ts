export interface CapabilitySnapshot {
  serviceWorker: boolean
  notifications: boolean
  mediaDevices: boolean
  getUserMedia: boolean
  peerConnection: boolean
  audioOutputSelection: boolean
  pushManager: boolean
  appBadge: boolean
  mediaSession: boolean
  videoPictureInPicture: boolean
  documentPictureInPicture: boolean
  wakeLock: boolean
}

export interface CapabilityProbeInput {
  serviceWorker?: unknown
  Notification?: unknown
  mediaDevices?: { getUserMedia?: unknown }
  RTCPeerConnection?: unknown
  setSinkId?: unknown
  PushManager?: unknown
  setAppBadge?: unknown
  mediaSession?: unknown
  requestPictureInPicture?: unknown
  documentPictureInPicture?: unknown
  wakeLock?: unknown
}

export function detectCapabilities(input: CapabilityProbeInput): CapabilitySnapshot {
  return {
    serviceWorker: input.serviceWorker !== undefined,
    notifications: typeof input.Notification === 'function',
    mediaDevices: input.mediaDevices !== undefined,
    getUserMedia: typeof input.mediaDevices?.getUserMedia === 'function',
    peerConnection: typeof input.RTCPeerConnection === 'function',
    audioOutputSelection: typeof input.setSinkId === 'function',
    pushManager: typeof input.PushManager === 'function',
    appBadge: typeof input.setAppBadge === 'function',
    mediaSession: input.mediaSession !== undefined,
    videoPictureInPicture: typeof input.requestPictureInPicture === 'function',
    documentPictureInPicture: input.documentPictureInPicture !== undefined,
    wakeLock: input.wakeLock !== undefined,
  }
}
