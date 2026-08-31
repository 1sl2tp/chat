import { INITIAL_SESSION_STATE, reduceSession, type SessionEvent, type SessionState } from './state'

type Listener = (state: SessionState) => void

let state: SessionState = INITIAL_SESSION_STATE
const listeners = new Set<Listener>()

export function getSessionState(): SessionState {
  return state
}

export function dispatchSession(event: SessionEvent): void {
  state = reduceSession(state, event)
  listeners.forEach((listener) => listener(state))
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}
