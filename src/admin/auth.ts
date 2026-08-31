export interface AdminSignInBackend {
  signIn(email: string, password: string): Promise<void>
}

export function normalizeAdminLogin(value: string): string {
  const normalized = value.trim().toLowerCase()
  return normalized === 'admin' ? 'admin@taphoa.chat' : normalized
}

export async function signInAdmin(
  backend: AdminSignInBackend,
  login: string,
  password: string,
): Promise<void> {
  const email = normalizeAdminLogin(login)
  if (!email || !password) throw new Error('admin_credentials_required')
  await backend.signIn(email, password)
}
