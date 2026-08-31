import type { ResolvedIdentity } from '../identity/contracts'

export type AppSurface =
  | { type: 'guest-chat' }
  | { type: 'customer-chat' }
  | { type: 'admin-login' }
  | { type: 'admin-workspace'; identity: ResolvedIdentity }
  | { type: 'access-denied' }
  | { type: 'identity-error'; message: string }

export interface StartupBackend {
  hasSession(): Promise<boolean>
  signInAnonymously(): Promise<void>
  resolveIdentity(): Promise<ResolvedIdentity>
}

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname === '/admin/'
}

export function decideSurface(pathname: string, identity: ResolvedIdentity | null): AppSurface {
  const adminPath = isAdminPath(pathname)

  if (!identity) {
    return adminPath ? { type: 'admin-login' } : { type: 'identity-error', message: 'identity_required' }
  }

  if (adminPath) {
    return identity.kind === 'admin' ? { type: 'admin-workspace', identity } : { type: 'access-denied' }
  }

  if (identity.kind === 'admin') return { type: 'access-denied' }
  if (identity.kind === 'guest_customer') return { type: 'guest-chat' }
  return { type: 'customer-chat' }
}

export async function resolveStartupSurface(pathname: string, backend: StartupBackend): Promise<AppSurface> {
  const hasSession = await backend.hasSession()
  if (!hasSession) {
    if (isAdminPath(pathname)) return { type: 'admin-login' }
    await backend.signInAnonymously()
  }

  try {
    const identity = await backend.resolveIdentity()
    return decideSurface(pathname, identity)
  } catch (cause) {
    return {
      type: 'identity-error',
      message: cause instanceof Error ? cause.message : String(cause),
    }
  }
}
