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
    throw new Error(`livekit_credentials_failed:${result.error.message}`)
  }

  const data = result.data as Partial<LiveKitCredentials> | null
  if (!data?.serverUrl || !data.participantToken) {
    throw new Error('livekit_credentials_invalid')
  }

  assertLiveKitServerUrl(data.serverUrl)
  return {
    serverUrl: data.serverUrl,
    participantToken: data.participantToken,
  }
}
