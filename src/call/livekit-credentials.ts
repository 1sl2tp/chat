import type { SupabaseClient } from '@supabase/supabase-js'
import { assertLiveKitServerUrl } from './livekit-config'

export interface LiveKitCredentials {
  serverUrl: string
  participantToken: string
}

export async function fetchLiveKitCredentials(
  client: SupabaseClient,
  callId: string,
  deviceId: string,
): Promise<LiveKitCredentials> {
  const result = await client.functions.invoke('taphoa-livekit-token', {
    body: { callId, deviceId },
  })

  if (result.error) {
    const reason = `livekit_credentials_failed:${result.error.message}`
    void reportCredentialFailure(client, callId, deviceId, reason)
    throw new Error(reason)
  }

  const data = result.data as Partial<LiveKitCredentials> | null
  if (!data?.serverUrl || !data.participantToken) {
    const reason = 'livekit_credentials_invalid'
    void reportCredentialFailure(client, callId, deviceId, reason)
    throw new Error(reason)
  }

  try {
    assertLiveKitServerUrl(data.serverUrl)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    void reportCredentialFailure(client, callId, deviceId, reason)
    throw error
  }

  return {
    serverUrl: data.serverUrl,
    participantToken: data.participantToken,
  }
}

async function reportCredentialFailure(
  client: SupabaseClient,
  callId: string,
  deviceId: string,
  error: string,
): Promise<void> {
  try {
    await client.rpc('chat_report_voice_media_state', {
      p_call_id: callId,
      p_device_id: deviceId,
      p_phase: 'error',
      p_payload: {
        reason: 'livekit_credentials_error',
        error,
        media: 'livekit',
      },
    })
  } catch {
    // Diagnostics must never block or replace the original call error.
  }
}
