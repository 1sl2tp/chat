import type { SupabaseClient } from '@supabase/supabase-js'

export async function sendChatMessagePush(client: SupabaseClient, messageId: string): Promise<void> {
  const result = await client.functions.invoke('taphoaxyz-call-push', {
    body: { action: 'send_message', message_id: messageId },
  })
  if (result.error) throw result.error
}
