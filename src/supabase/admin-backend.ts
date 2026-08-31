import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdminBackend } from '../admin/contracts'
import { decodeAdminDetail, decodeAdminInbox } from '../admin/contracts'
import { supabase } from './client'

export function createSupabaseAdminBackend(client: SupabaseClient = supabase): AdminBackend {
  return {
    async loadInbox(limit = 100) {
      const { data, error } = await client.rpc('chat_admin_support_inbox', { p_limit: limit })
      if (error) throw error
      return decodeAdminInbox(data)
    },

    async loadDetail(conversationId) {
      const { data, error } = await client.rpc('chat_admin_support_detail', {
        p_conversation_id: conversationId,
      })
      if (error) throw error
      return decodeAdminDetail(data)
    },
  }
}
