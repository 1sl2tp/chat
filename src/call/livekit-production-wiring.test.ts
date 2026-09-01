import { describe, expect, it } from 'vitest'
import sessionSource from './voice-session.ts?raw'
import mediaSource from './livekit-media.ts?raw'

describe('production LiveKit credential wiring', () => {
  it('keeps token fetching in VoiceCallSession and out of the media adapter', () => {
    expect(sessionSource).toContain("fetchLiveKitCredentials(this.client, callId, context.deviceId)")
    expect(mediaSource).not.toContain('developmentTokenServer')
    expect(mediaSource).not.toContain('LIVEKIT_TOKEN_SERVER_ID')
  })
})
