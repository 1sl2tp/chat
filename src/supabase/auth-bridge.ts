import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'
import type { SessionEvent } from '../session/state'
import { sessionToEvent } from './session-adapter'

export function authChangeToSessionEvent(event: AuthChangeEvent, session: Session | null): SessionEvent | null {
  switch (event) {
    case 'INITIAL_SESSION':
    case 'SIGNED_IN':
    case 'USER_UPDATED':
      return sessionToEvent(session)
    case 'TOKEN_REFRESHED':
      return session
        ? { type: 'REFRESH_SUCCESS', userId: session.user.id, expiresAt: session.expires_at ?? null }
        : { type: 'EXPIRE' }
    case 'SIGNED_OUT':
      return { type: 'SIGN_OUT' }
    default:
      return null
  }
}

export function observeSupabaseAuth(client: SupabaseClient, dispatch: (event: SessionEvent) => void): () => void {
  const { data } = client.auth.onAuthStateChange((event, session) => {
    const mapped = authChangeToSessionEvent(event, session)
    if (mapped) dispatch(mapped)
  })

  return () => data.subscription.unsubscribe()
}
