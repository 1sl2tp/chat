import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessageBackend, ChatRealtimeStatus } from '../chat/message-runtime'
import type { ChatMessage } from '../chat/messages'
import { supabase } from './client'

const MESSAGE_COLUMNS = 'id,conversation_id,sender_id,client_message_id,type,text,reply_to_id,created_at,edited_at,revoked_at,call_id'

function asChatMessage(value: unknown): ChatMessage {
  return value as ChatMessage
}

export function createSupabaseMessageBackend(client: SupabaseClient = supabase): ChatMessageBackend {
  return {
    async loadMessages(conversationId) {
      const { data, error } = await client
        .from('chat_messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []).map(asChatMessage)
    },

    subscribeMessages(conversationId, onMessage, onStatus) {
      let channel: RealtimeChannel | null = client
        .channel(`chat-messages:${conversationId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
          (payload) => onMessage(asChatMessage(payload.new)),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
          (payload) => onMessage(asChatMessage(payload.new)),
        )
        .subscribe((status, error) => {
          const mapped: ChatRealtimeStatus = status === 'SUBSCRIBED' ? 'subscribed' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'error' : 'connecting'
          onStatus(mapped, error ?? undefined)
        })

      return () => {
        if (!channel) return
        void client.removeChannel(channel)
        channel = null
      }
    },

    async sendText(conversationId, clientMessageId, text) {
      const { data, error } = await client.rpc('chat_send_text_message', {
        p_conversation_id: conversationId,
        p_client_message_id: clientMessageId,
        p_text: text,
        p_reply_to_id: null,
      })
      if (error) throw error
      return asChatMessage(data)
    },

    async markRead(conversationId) {
      const { error } = await client.rpc('chat_mark_conversation_read', {
        target_conversation_id: conversationId,
      })
      if (error) throw error
    },
  }
}
