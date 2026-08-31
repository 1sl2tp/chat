export interface AdminBootstrapInput {
  deviceKey: string
  label: string
  platform: string
}

export interface AdminIdentityBootstrapBackend {
  hasSession(): Promise<boolean>
  bootstrapIdentity(input: AdminBootstrapInput): Promise<unknown>
}

export async function bootstrapAdminIdentity(
  backend: AdminIdentityBootstrapBackend,
  input: AdminBootstrapInput,
): Promise<unknown> {
  const hasSession = await backend.hasSession()
  if (!hasSession) throw new Error('admin_session_required')
  return backend.bootstrapIdentity(input)
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
