export interface User2LoginBackend {
  endGuestSession(): Promise<void>
  signInUser2(email: string, password: string): Promise<void>
}

export interface User2LogoutBackend {
  endUser2Session(): Promise<void>
  signOutUser2(): Promise<void>
}

export interface User2PasswordBackend {
  updatePassword(password: string): Promise<void>
}

export function normalizeUser2Username(value: string): string {
  const username = value.trim().replace(/^@+/, '').toLowerCase()
  if (username === 'admin') throw new Error('admin_uses_admin_page')
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('invalid_username')
  return username
}

export async function loginUser2(
  backend: User2LoginBackend,
  usernameValue: string,
  password: string,
): Promise<void> {
  const username = normalizeUser2Username(usernameValue)
  await backend.endGuestSession()
  await backend.signInUser2(`${username}@taphoa.chat`, password)
}

export async function logoutUser2(backend: User2LogoutBackend): Promise<void> {
  try {
    await backend.endUser2Session()
  } catch {
    // Auth logout must still complete if remote session cleanup cannot reach the server.
  }
  await backend.signOutUser2()
}

export async function changeUser2Password(
  backend: User2PasswordBackend,
  password: string,
  confirmation: string,
): Promise<void> {
  if (password !== confirmation) throw new Error('password_mismatch')
  if (password.length < 6) throw new Error('password_too_short')
  await backend.updatePassword(password)
}
