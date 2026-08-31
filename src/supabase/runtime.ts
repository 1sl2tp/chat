import { dispatchSession } from '../session/store'
import { observeSupabaseAuth } from './auth-bridge'
import { supabase } from './client'

let stopObservingAuth: (() => void) | null = null

export function startSupabaseRuntime(): void {
  if (stopObservingAuth) return
  stopObservingAuth = observeSupabaseAuth(supabase, dispatchSession)
}

export function stopSupabaseRuntime(): void {
  stopObservingAuth?.()
  stopObservingAuth = null
}
