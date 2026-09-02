import { stopAdminRuntime } from './runtime'

export interface AdminLogoutBackend {
  unsubscribePush(): Promise<void>
  endAdminSession(): Promise<void>
  signOutAdmin(): Promise<void>
}

export async function logoutAdmin(backend: AdminLogoutBackend): Promise<void> {
  stopAdminRuntime()

  try {
    await backend.unsubscribePush()
  } catch {
    // Push cleanup is best-effort; Auth sign-out must still complete.
  }

  try {
    await backend.endAdminSession()
  } catch {
    // Server cleanup is best-effort; Auth sign-out remains the final authority.
  }

  await backend.signOutAdmin()
}
