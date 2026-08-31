import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_BROWSER_CONFIG, type SupabaseBrowserConfig } from './config'

export function createBrowserSupabaseClient(config: SupabaseBrowserConfig = SUPABASE_BROWSER_CONFIG): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

export const supabase = createBrowserSupabaseClient()
