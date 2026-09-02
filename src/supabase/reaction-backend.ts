import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { ChatReaction, ChatReactionBackend } from '../chat/reactions/session'
import { supabase } from './client'

const REACTION_COLUMNS = 'message_id,profile_id,emoji,updated_at'

function asReaction(value: unknown): ChatReaction {
  return value as ChatReaction
}

export function createSupabaseReactionBackend(client: SupabaseClient = supabase): ChatReactionBackend {
  return {
    async load(messageIds) {
      if (messageIds.length === 0) return []
      const { data, error } = await client
        .from('chat_message_reactions')
        .select(REACTION_COLUMNS)
        .in('message_id', messageIds)
      if (error) throw error
      return (data ?? []).map(asReaction)
    },

    subscribe(onReaction) {
      let channel: RealtimeChannel | null = client
        .channel('chat-message-reactions')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_message_reactions' },
          (payload) => {
            const value = payload.eventType === 'DELETE' ? payload.old : payload.new
            if (value && typeof value === 'object') onReaction(asReaction(value))
          },
        )
        .subscribe()

      return () => {
        if (!channel) return
        void client.removeChannel(channel)
        channel = null
      }
    },

    async set(messageId, emoji) {
      const { data, error } = await client.rpc('chat_set_message_reaction', {
        p_message_id: messageId,
        p_emoji: emoji,
      })
      if (error) throw error
      return asReaction(data)
    },
  }
}
