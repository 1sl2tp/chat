export interface CapabilitySnapshot {
  serviceWorker: boolean
  notifications: boolean
  permissionsApi: boolean
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
  visualViewport: boolean
  virtualKeyboard: boolean
}

export interface CapabilityProbeInput {
  serviceWorker?: unknown
  Notification?: unknown
  permissions?: unknown
  mediaDevices?: { getUserMedia?: unknown }
  RTCPeerConnection?: unknown
  setSinkId?: unknown
  PushManager?: unknown
  setAppBadge?: unknown
  mediaSession?: unknown
  requestPictureInPicture?: unknown
  documentPictureInPicture?: unknown
  wakeLock?: unknown
  visualViewport?: unknown
  virtualKeyboard?: unknown
}

export function detectCapabilities(input: CapabilityProbeInput): CapabilitySnapshot {
  return {
    serviceWorker: input.serviceWorker !== undefined,
    notifications: typeof input.Notification === 'function',
    permissionsApi: input.permissions !== undefined,
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
    visualViewport: input.visualViewport !== undefined,
    virtualKeyboard: input.virtualKeyboard !== undefined,
  }
}
