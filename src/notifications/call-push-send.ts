import type { SupabaseClient } from '@supabase/supabase-js'

export async function sendIncomingCallPush(client: SupabaseClient, callId: string): Promise<void> {
  const result = await client.functions.invoke('taphoaxyz-call-push', {
    body: { action: 'send', call_id: callId },
  })
  if (result.error) throw result.error
}
