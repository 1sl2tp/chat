import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('production LiveKit credential wiring', () => {
  it('keeps token fetching in VoiceCallSession and out of the media adapter', () => {
    const session = readFileSync(new URL('./voice-session.ts', import.meta.url), 'utf8')
    const media = readFileSync(new URL('./livekit-media.ts', import.meta.url), 'utf8')

    expect(session).toContain("fetchLiveKitCredentials(this.client, callId, context.deviceId)")
    expect(media).not.toContain('developmentTokenServer')
    expect(media).not.toContain('LIVEKIT_TOKEN_SERVER_ID')
  })
})
