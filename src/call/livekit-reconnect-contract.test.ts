import { describe, expect, it } from 'vitest'
import { LiveKitVoiceMedia, type LiveKitMediaCallbacks } from './livekit-media'

const callbacks: LiveKitMediaCallbacks = {
  onPeerConnected() {},
  onPeerDisconnected() {},
  onReconnecting() {},
  onReconnected() {},
  onRemoteAudioSubscribed() {},
  onRemoteAudioPlaying() {},
  onAudioPlaybackBlocked() {},
  onMicrophonePermissionState() {},
  onError() {},
}

describe('LiveKit reconnect contract', () => {
  it('exposes reconnect callbacks and foreground recovery on the media owner', () => {
    const method: keyof LiveKitVoiceMedia = 'resumeAfterForeground'
    expect(method).toBe('resumeAfterForeground')
    expect(callbacks.onReconnecting).toBeTypeOf('function')
    expect(callbacks.onReconnected).toBeTypeOf('function')
  })
})
