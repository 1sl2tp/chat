import type { SupabaseClient } from '@supabase/supabase-js'
import type { CustomerProfile, ProfileBackend } from '../profile/contracts'
import { supabase } from './client'

function asCustomerProfile(value: unknown): CustomerProfile {
  return value as CustomerProfile
}

export function createSupabaseProfileBackend(client: SupabaseClient = supabase): ProfileBackend {
  return {
    async updateMyProfile(patch) {
      const { data, error } = await client.rpc('chat_update_my_profile', {
        p_display_name: patch.displayName,
        p_username: null,
        p_avatar_url: null,
        p_address: patch.address,
      })
      if (error) throw error
      return asCustomerProfile(data)
    },
  }
}
