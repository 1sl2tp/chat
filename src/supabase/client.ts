import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_BROWSER_CONFIG, type SupabaseBrowserConfig } from './config'

export type AuthOwner = 'guest' | 'user2' | 'admin'
export type AuthPersistence = 'session' | 'local'

export const GUEST_AUTH_STORAGE_KEY = 'taphoa-chat-guest-auth'
export const USER_AUTH_STORAGE_KEY = 'taphoa-chat-user-auth'
export const ADMIN_AUTH_STORAGE_KEY = 'taphoa-chat-admin-auth'

const AUTH_STORAGE_DESCRIPTORS: Record<AuthOwner, { key: string; persistence: AuthPersistence }> = {
  guest: { key: GUEST_AUTH_STORAGE_KEY, persistence: 'session' },
  user2: { key: USER_AUTH_STORAGE_KEY, persistence: 'local' },
  admin: { key: ADMIN_AUTH_STORAGE_KEY, persistence: 'local' },
}

export function authStorageDescriptor(owner: AuthOwner): { key: string; persistence: AuthPersistence } {
  return AUTH_STORAGE_DESCRIPTORS[owner]
}

function browserStorage(persistence: AuthPersistence): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return persistence === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return undefined
  }
}

export function createBrowserSupabaseClient(
  config: SupabaseBrowserConfig = SUPABASE_BROWSER_CONFIG,
  storageKey?: string,
  storage?: Storage,
): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(storageKey ? { storageKey } : {}),
      ...(storage ? { storage } : {}),
    },
  })
}

const guestAuth = authStorageDescriptor('guest')
const userAuth = authStorageDescriptor('user2')
const adminAuth = authStorageDescriptor('admin')

export const guestSupabase = createBrowserSupabaseClient(
  SUPABASE_BROWSER_CONFIG,
  guestAuth.key,
  browserStorage(guestAuth.persistence),
)

export const userSupabase = createBrowserSupabaseClient(
  SUPABASE_BROWSER_CONFIG,
  userAuth.key,
  browserStorage(userAuth.persistence),
)

// Compatibility alias for modules that still mean the persistent root User client.
export const supabase = userSupabase

// Admin stays isolated from root User auth on the same origin.
export const adminSupabase = createBrowserSupabaseClient(
  SUPABASE_BROWSER_CONFIG,
  adminAuth.key,
  browserStorage(adminAuth.persistence),
)
