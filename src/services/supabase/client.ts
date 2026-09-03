import type { SupabaseRuntimeConfig } from './config.js';
import { SupabaseJsPort, type SupabaseJsClientLike } from './supabase-js-port.js';

export type SupabaseCreateClient = (
  url: string,
  publishableKey: string,
  options: { auth: { persistSession: boolean; autoRefreshToken: boolean; detectSessionInUrl: boolean } }
) => unknown;

export function createTaphoaSupabasePort(config: SupabaseRuntimeConfig, createClient: SupabaseCreateClient): SupabaseJsPort {
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return new SupabaseJsPort(client as SupabaseJsClientLike);
}
