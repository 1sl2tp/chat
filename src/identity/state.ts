import type { ResolvedIdentity } from './contracts'

export type IdentityPhase = 'idle' | 'resolving' | 'ready' | 'error'

export interface IdentityState {
  phase: IdentityPhase
  identity: ResolvedIdentity | null
  error: string | null
}

export type IdentityEvent =
  | { type: 'RESOLVE_START' }
  | { type: 'RESOLVE_SUCCESS'; identity: ResolvedIdentity }
  | { type: 'RESOLVE_ERROR'; error: string }
  | { type: 'RESET' }

export const INITIAL_IDENTITY_STATE: IdentityState = {
  phase: 'idle',
  identity: null,
  error: null,
}

export function reduceIdentity(_state: IdentityState, event: IdentityEvent): IdentityState {
  switch (event.type) {
    case 'RESOLVE_START':
      return { phase: 'resolving', identity: null, error: null }
    case 'RESOLVE_SUCCESS':
      return { phase: 'ready', identity: event.identity, error: null }
    case 'RESOLVE_ERROR':
      return { phase: 'error', identity: null, error: event.error }
    case 'RESET':
      return INITIAL_IDENTITY_STATE
  }
}
