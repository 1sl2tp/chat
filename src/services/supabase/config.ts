export interface SupabaseRuntimeConfig {
  url: string;
  publishableKey: string;
}

declare const __TAPHOA_SUPABASE_URL__: string | undefined;
declare const __TAPHOA_SUPABASE_PUBLISHABLE_KEY__: string | undefined;

export function readSupabaseConfig(env: Record<string, string | undefined>): SupabaseRuntimeConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function readBundledSupabaseConfig(): SupabaseRuntimeConfig | null {
  const url = typeof __TAPHOA_SUPABASE_URL__ === 'string' ? __TAPHOA_SUPABASE_URL__.trim() : '';
  const publishableKey = typeof __TAPHOA_SUPABASE_PUBLISHABLE_KEY__ === 'string' ? __TAPHOA_SUPABASE_PUBLISHABLE_KEY__.trim() : '';
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
