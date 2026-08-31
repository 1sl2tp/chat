import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthActions } from '../auth/contracts'
import { supabase } from './client'

export function createSupabaseAuthActions(client: SupabaseClient = supabase): AuthActions {
  return {
    async signInWithPassword(credentials) {
      const { error } = await client.auth.signInWithPassword(credentials)
      if (error) throw new Error('auth_invalid_credentials')
    },
    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw new Error('auth_sign_out_failed')
    },
  }
}
