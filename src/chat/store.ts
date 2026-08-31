export type ChatBootstrapPhase = 'idle' | 'loading' | 'ready' | 'error'

export interface ChatRuntimeState {
  phase: ChatBootstrapPhase
  identity: unknown
  supportEntry: unknown
  error: string | null
}

let state: ChatRuntimeState = {
  phase: 'idle',
  identity: null,
  supportEntry: null,
  error: null,
}

const listeners = new Set<(state: ChatRuntimeState) => void>()

export function getChatRuntimeState(): ChatRuntimeState {
  return state
}

export function setChatRuntimeState(next: ChatRuntimeState): void {
  state = next
  for (const listener of listeners) listener(state)
}

export function subscribeChatRuntime(listener: (state: ChatRuntimeState) => void): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}
