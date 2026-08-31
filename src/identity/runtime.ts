import type { IdentityBackend, ResolvedIdentity } from './contracts'
import { dispatchIdentity } from './store'

export async function resolveIdentity(backend: IdentityBackend): Promise<ResolvedIdentity> {
  dispatchIdentity({ type: 'RESOLVE_START' })
  try {
    const identity = await backend.resolveCurrentIdentity()
    dispatchIdentity({ type: 'RESOLVE_SUCCESS', identity })
    return identity
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    dispatchIdentity({ type: 'RESOLVE_ERROR', error: message })
    throw cause
  }
}

export function resetIdentity(): void {
  dispatchIdentity({ type: 'RESET' })
}
