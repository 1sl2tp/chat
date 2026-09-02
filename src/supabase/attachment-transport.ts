import type { SupabaseClient } from '@supabase/supabase-js'
import type { AttachmentTransport } from '../chat/attachments/controller'
import type { ChatMessage } from '../chat/messages'
import { supabase } from './client'

const ATTACHMENT_BUCKET = 'chat-attachments'
const SIGNED_URL_SECONDS = 60 * 60

function asChatMessage(value: unknown): ChatMessage {
  return value as ChatMessage
}

export function createSupabaseAttachmentTransport(client: SupabaseClient = supabase): AttachmentTransport {
  return {
    async upload(path, file) {
      const { error } = await client.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
      if (error) throw error
    },
    async remove(path) {
      const { error } = await client.storage.from(ATTACHMENT_BUCKET).remove([path])
      if (error) throw error
    },
    async send(input) {
      const { data, error } = await client.rpc('chat_send_attachment_message', {
        p_conversation_id: input.conversationId,
        p_client_message_id: input.clientMessageId,
        p_type: input.type,
        p_attachment: input.attachment,
        p_text: null,
      })
      if (error) throw error
      return asChatMessage(data)
    },
  }
}

export async function createSignedAttachmentUrl(
  client: SupabaseClient,
  path: string,
): Promise<string> {
  const { data, error } = await client.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('attachment_signed_url_missing')
  return data.signedUrl
}
