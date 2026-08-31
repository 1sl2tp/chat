import type { CapabilitySnapshot } from '../compat/capabilities'

export interface MediaSupport {
  canCaptureAudio: boolean
  canCall: boolean
  canSelectAudioOutput: boolean
}

export function deriveMediaSupport(capabilities: CapabilitySnapshot): MediaSupport {
  const canCaptureAudio = capabilities.mediaDevices && capabilities.getUserMedia

  return {
    canCaptureAudio,
    canCall: canCaptureAudio && capabilities.peerConnection,
    canSelectAudioOutput: capabilities.audioOutputSelection,
  }
}
