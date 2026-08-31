import type { SupabaseClient } from '@supabase/supabase-js'
import { decodeResolvedIdentity, type IdentityBackend } from '../identity/contracts'
import { supabase } from './client'

export function createSupabaseIdentityBackend(client: SupabaseClient = supabase): IdentityBackend {
  return {
    async resolveCurrentIdentity() {
      const { data, error } = await client.rpc('chat_resolve_identity')
      if (error) throw error
      return decodeResolvedIdentity(data)
    },
  }
}
