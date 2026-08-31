import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_BROWSER_CONFIG, type SupabaseBrowserConfig } from './config'

export const ADMIN_AUTH_STORAGE_KEY = 'taphoa-chat-admin-auth'

export function createBrowserSupabaseClient(
  config: SupabaseBrowserConfig = SUPABASE_BROWSER_CONFIG,
  storageKey?: string,
): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(storageKey ? { storageKey } : {}),
    },
  })
}

// User keeps the existing/default Supabase storage key so current customer sessions are preserved.
export const supabase = createBrowserSupabaseClient()

// Admin uses a different storage key on the same origin, so /admin and User can be open together.
export const adminSupabase = createBrowserSupabaseClient(SUPABASE_BROWSER_CONFIG, ADMIN_AUTH_STORAGE_KEY)
