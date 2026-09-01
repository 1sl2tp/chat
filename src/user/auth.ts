export interface User2AuthBackend {
  endGuestSession(): Promise<void>
  endUser2Session(): Promise<void>
  signInUser2(email: string, password: string): Promise<void>
  signOutUser2(): Promise<void>
}

export function normalizeUser2Username(value: string): string {
  const username = value.trim().replace(/^@+/, '').toLowerCase()
  if (username === 'admin') throw new Error('admin_uses_admin_page')
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('invalid_username')
  return username
}

export async function loginUser2(
  backend: User2AuthBackend,
  usernameValue: string,
  password: string,
): Promise<void> {
  const username = normalizeUser2Username(usernameValue)
  await backend.endGuestSession()
  await backend.signInUser2(`${username}@taphoa.chat`, password)
}

export async function logoutUser2(backend: User2AuthBackend): Promise<void> {
  try {
    await backend.endUser2Session()
  } catch {
    // Auth logout must still complete if remote session cleanup cannot reach the server.
  }
  await backend.signOutUser2()
}
