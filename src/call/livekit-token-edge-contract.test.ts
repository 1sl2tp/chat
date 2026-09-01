import { describe, expect, it } from 'vitest'
import tokenFunctionSource from '../../supabase/functions/taphoa-livekit-token/index.ts?raw'
import sessionSource from './voice-session.ts?raw'

describe('LiveKit token browser boundary', () => {
  it('uses the Supabase SDK CORS helper instead of a frozen header allow-list', () => {
    expect(tokenFunctionSource).toContain("@supabase/supabase-js@2.112.4/cors")
    expect(tokenFunctionSource).not.toContain("'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'")
  })

  it('records the actual session failure reason before collapsing to the UI error state', () => {
    expect(sessionSource).toContain("void this.reportMediaState('error', { reason: 'session_error', error: reason })")
  })
})
