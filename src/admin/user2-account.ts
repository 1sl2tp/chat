export interface AdminUser2CreateBackend {
  create(input: { username: string; password: string }): Promise<{ username: string }>
}

export function normalizeNewUser2(usernameValue: string, passwordValue: string): { username: string; password: string } {
  const username = usernameValue.trim().replace(/^@+/, '').toLowerCase()
  const password = passwordValue
  if (username === 'admin') throw new Error('reserved_username')
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('invalid_username')
  if (password.length < 6) throw new Error('password_too_short')
  return { username, password }
}

export async function createUser2FromAdmin(
  backend: AdminUser2CreateBackend,
  usernameValue: string,
  passwordValue: string,
): Promise<{ username: string }> {
  const input = normalizeNewUser2(usernameValue, passwordValue)
  return backend.create(input)
}
