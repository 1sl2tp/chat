import type { ResolvedIdentity } from '../identity/contracts'

export type AppSurface =
  | { type: 'guest-chat' }
  | { type: 'customer-chat' }
  | { type: 'admin-login' }
  | { type: 'admin-workspace' }
  | { type: 'access-denied' }
  | { type: 'identity-error'; message: string }

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname === '/admin/'
}

export function decideSurface(pathname: string, identity: ResolvedIdentity | null): AppSurface {
  const adminPath = isAdminPath(pathname)

  if (!identity) {
    return adminPath ? { type: 'admin-login' } : { type: 'identity-error', message: 'identity_required' }
  }

  if (adminPath) {
    return identity.kind === 'admin' ? { type: 'admin-workspace' } : { type: 'access-denied' }
  }

  if (identity.kind === 'admin') return { type: 'access-denied' }
  if (identity.kind === 'guest_customer') return { type: 'guest-chat' }
  return { type: 'customer-chat' }
}
