import { INITIAL_IDENTITY_STATE, reduceIdentity, type IdentityEvent, type IdentityState } from './state'

type Listener = (state: IdentityState) => void

let state: IdentityState = INITIAL_IDENTITY_STATE
const listeners = new Set<Listener>()

export function getIdentityState(): IdentityState {
  return state
}

export function dispatchIdentity(event: IdentityEvent): void {
  state = reduceIdentity(state, event)
  listeners.forEach((listener) => listener(state))
}

export function subscribeIdentity(listener: Listener): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}
