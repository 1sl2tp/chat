import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { corsHeaders as supabaseCorsHeaders } from 'npm:@supabase/supabase-js@2.112.4/cors'
import { AccessToken } from 'npm:livekit-server-sdk@2.18.0'
import { authorizeLiveKitJoin } from '../_shared/livekit-join-policy.ts'

const LIVEKIT_SERVER_URL = 'wss://taphoa-chat-dvo9mem2.livekit.cloud'
const corsHeaders = {
  ...supabaseCorsHeaders,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '600',
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json(401, { error: 'unauthorized' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) return json(500, { error: 'server_configuration_error' })

  try {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const profileResult = await client.rpc('chat_current_profile_id')
    if (profileResult.error || !profileResult.data) return json(401, { error: 'unauthorized' })

    const body = await req.json().catch(() => null) as {
      action?: unknown
      callId?: unknown
      deviceId?: unknown
    } | null

    if (body?.action === 'warm') return json(200, { ok: true })

    const callsResult = await client.rpc('chat_get_active_voice_calls')
    if (callsResult.error || !Array.isArray(callsResult.data)) return json(403, { error: 'forbidden' })

    if (!body || typeof body.callId !== 'string' || typeof body.deviceId !== 'string') {
      return json(400, { error: 'invalid_request' })
    }

    let authorized
    try {
      authorized = authorizeLiveKitJoin({
        currentProfileId: String(profileResult.data),
        callId: body.callId,
        deviceId: body.deviceId,
        activeCalls: callsResult.data,
      })
    } catch {
      return json(403, { error: 'forbidden' })
    }

    const apiKey = Deno.env.get('LIVEKIT_API_KEY')
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
    if (!apiKey || !apiSecret) return json(500, { error: 'server_configuration_error' })

    const token = new AccessToken(apiKey, apiSecret, {
      identity: authorized.participantIdentity,
      name: authorized.participantName,
      ttl: '10m',
    })
    token.addGrant({
      roomJoin: true,
      room: authorized.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    })

    const participantToken = await token.toJwt()
    return json(200, { serverUrl: LIVEKIT_SERVER_URL, participantToken })
  } catch {
    return json(500, { error: 'internal_error' })
  }
})