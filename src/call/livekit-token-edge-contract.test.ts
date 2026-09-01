import { describe, expect, it } from 'vitest'
import tokenFunctionSource from '../../supabase/functions/taphoa-livekit-token/index.ts?raw'
import credentialsSource from './livekit-credentials.ts?raw'

describe('LiveKit token browser boundary', () => {
  it('uses the Supabase SDK CORS helper instead of a frozen header allow-list', () => {
    expect(tokenFunctionSource).toContain("@supabase/supabase-js@2.112.4/cors")
    expect(tokenFunctionSource).not.toContain("'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'")
  })

  it('records the actual credential failure reason before surfacing the call error', () => {
    expect(credentialsSource).toContain("reason: 'livekit_credentials_error'")
    expect(credentialsSource).toContain("p_phase: 'error'")
    expect(credentialsSource).toContain("chat_report_voice_media_state")
  })
})
