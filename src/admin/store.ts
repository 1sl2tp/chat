import type { AdminInboxItem, AdminSupportDetail } from './contracts'

export interface AdminState {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  inbox: AdminInboxItem[]
  selectedConversationId: string | null
  detail: AdminSupportDetail | null
  error: string | null
}

let state: AdminState = {
  phase: 'idle',
  inbox: [],
  selectedConversationId: null,
  detail: null,
  error: null,
}

const listeners = new Set<(state: AdminState) => void>()

export function getAdminState(): AdminState {
  return state
}

export function setAdminState(next: AdminState): void {
  state = next
  for (const listener of listeners) listener(state)
}

export function subscribeAdminState(listener: (state: AdminState) => void): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}
