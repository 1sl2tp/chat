import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatBootstrapBackend } from '../chat/bootstrap'
import { supabase } from './client'

export function createSupabaseChatBackend(client: SupabaseClient = supabase): ChatBootstrapBackend {
  return {
    async hasSession() {
      const { data, error } = await client.auth.getSession()
      if (error) throw error
      return data.session !== null
    },

    async signInAnonymously() {
      const { error } = await client.auth.signInAnonymously()
      if (error) throw error
    },

    async bootstrapIdentity({ deviceKey, label, platform }) {
      const { data, error } = await client.rpc('chat_bootstrap_identity', {
        p_legacy_guest_token: null,
        p_device_key: deviceKey,
        p_label: label,
        p_platform: platform,
      })
      if (error) throw error
      return data
    },

    async getSupportEntry() {
      const { data, error } = await client.rpc('chat_get_support_entry')
      if (error) throw error
      return data
    },
  }
}
