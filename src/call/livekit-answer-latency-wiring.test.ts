import { describe, expect, it } from 'vitest'
import mediaSource from './livekit-media.ts?raw'
import sessionSource from './voice-session.ts?raw'
import tokenFunctionSource from '../../supabase/functions/taphoa-livekit-token/index.ts?raw'

describe('production answer latency wiring', () => {
  it('overlaps LiveKit room connect with the pending microphone capture', () => {
    const joinStart = mediaSource.indexOf('async join(credentials: LiveKitJoinCredentials)')
    const joinEnd = mediaSource.indexOf('async setMuted', joinStart)
    const joinSource = mediaSource.slice(joinStart, joinEnd)

    expect(joinSource).toContain('connectRoomWhileCapturing(')
    expect(joinSource).toContain('room.connect(credentials.serverUrl, credentials.participantToken)')
  })

  it('warms token issuance before an answer needs credentials', () => {
    expect(sessionSource).toContain("import { fetchLiveKitCredentials, warmLiveKitTokenFunction } from './livekit-credentials'")
    expect(sessionSource).toContain('void warmLiveKitTokenFunction(this.client)')
  })

  it('supports authenticated warm-up and caches browser preflight', () => {
    expect(tokenFunctionSource).toContain("'Access-Control-Max-Age': '600'")
    expect(tokenFunctionSource).toContain("body?.action === 'warm'")
    expect(tokenFunctionSource.indexOf("body?.action === 'warm'"))
      .toBeLessThan(tokenFunctionSource.indexOf("client.rpc('chat_get_active_voice_calls')"))
  })
})
