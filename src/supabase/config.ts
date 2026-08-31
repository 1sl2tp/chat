export interface SupabaseBrowserConfig {
  url: string
  publishableKey: string
}

export function createSupabaseConfig(url: string, publishableKey: string): SupabaseBrowserConfig {
  if (!url || !publishableKey) {
    throw new Error('Missing Supabase browser configuration')
  }

  return { url, publishableKey }
}

export const SUPABASE_BROWSER_CONFIG = createSupabaseConfig(
  'https://gcnoahqsrquxkwkjbuxy.supabase.co',
  'sb_publishable_UY3gfQ9MsntDFCUJ_uV0UA__eTYXz_w',
)
