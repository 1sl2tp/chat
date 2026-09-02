export interface AdminBootstrapInput {
  deviceKey: string
  label: string
  platform: string
}

export interface AdminIdentityBootstrapBackend {
  hasSession(): Promise<boolean>
  bootstrapIdentity(input: AdminBootstrapInput): Promise<unknown>
}

let bootstrappedAdminIdentity: unknown = null

export function getBootstrappedAdminProfileId(): string {
  if (!bootstrappedAdminIdentity || typeof bootstrappedAdminIdentity !== 'object') return ''
  const profile = (bootstrappedAdminIdentity as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object') return ''
  return String((profile as { id?: unknown }).id ?? '')
}

export function clearBootstrappedAdminIdentity(): void {
  bootstrappedAdminIdentity = null
}

export async function bootstrapAdminIdentity(
  backend: AdminIdentityBootstrapBackend,
  input: AdminBootstrapInput,
): Promise<unknown> {
  const hasSession = await backend.hasSession()
  if (!hasSession) {
    clearBootstrappedAdminIdentity()
    throw new Error('admin_session_required')
  }
  const identity = await backend.bootstrapIdentity(input)
  bootstrappedAdminIdentity = identity
  return identity
}

export interface AdminWorkspaceStartup {
  bootstrap(): Promise<unknown>
  startAdmin(): Promise<void>
  onError(error: Error): void
}

export async function startAdminWorkspace(startup: AdminWorkspaceStartup): Promise<void> {
  try {
    await startup.bootstrap()
    await startup.startAdmin()
  } catch (cause) {
    startup.onError(cause instanceof Error ? cause : new Error(String(cause)))
  }
}
