import type { SessionEvent } from '../session/state'

export interface SupabaseSessionLike {
  user: { id: string }
  expires_at?: number | null
}

export function sessionToEvent(session: SupabaseSessionLike | null): SessionEvent {
  if (!session) return { type: 'RESTORE_ANONYMOUS' }

  return {
    type: 'RESTORE_AUTHENTICATED',
    userId: session.user.id,
    expiresAt: session.expires_at ?? null,
  }
}
