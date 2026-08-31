export type SessionPhase = 'initializing' | 'anonymous' | 'authenticated' | 'refreshing' | 'expired' | 'signed-out'

export interface SessionState {
  phase: SessionPhase
  userId: string | null
  expiresAt: number | null
}

export type SessionEvent =
  | { type: 'RESTORE_ANONYMOUS' }
  | { type: 'RESTORE_AUTHENTICATED'; userId: string; expiresAt: number | null }
  | { type: 'REFRESH_START' }
  | { type: 'REFRESH_SUCCESS'; userId: string; expiresAt: number | null }
  | { type: 'EXPIRE' }
  | { type: 'SIGN_OUT' }

export const INITIAL_SESSION_STATE: SessionState = {
  phase: 'initializing',
  userId: null,
  expiresAt: null,
}

export function reduceSession(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'RESTORE_ANONYMOUS':
      return { phase: 'anonymous', userId: null, expiresAt: null }
    case 'RESTORE_AUTHENTICATED':
    case 'REFRESH_SUCCESS':
      return { phase: 'authenticated', userId: event.userId, expiresAt: event.expiresAt }
    case 'REFRESH_START':
      return { ...state, phase: 'refreshing' }
    case 'EXPIRE':
      return { ...state, phase: 'expired' }
    case 'SIGN_OUT':
      return { phase: 'signed-out', userId: null, expiresAt: null }
  }
}
