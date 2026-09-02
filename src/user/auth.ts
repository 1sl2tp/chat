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

export interface User1UpgradeBackend {
  upgradeCurrentGuest(input: {
    displayName: string
    username: string
    password: string
  }): Promise<{ loginUsername: string }>
  signInPersistentUser2(email: string, password: string): Promise<void>
  clearGuestAuthSession(): Promise<void>
}

export interface User2ProfileBackend {
  update(input: { displayName: string; username: string }): Promise<{ displayName: string; username: string }>
}

export interface User2Registration {
  displayName: string
  username: string
  password: string
}

export interface User2ProfileInput {
  displayName: string
  username: string
}

export function normalizeUser2Username(value: string): string {
  const username = value.trim().replace(/^@+/, '').toLowerCase()
  if (username === 'admin') throw new Error('admin_uses_admin_page')
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('invalid_username')
  return username
}

export function normalizeUser2DisplayName(value: string): string {
  const displayName = value.trim()
  if (displayName.length < 1 || displayName.length > 50) throw new Error('invalid_display_name')
  return displayName
}

export function normalizeUser2Registration(
  displayNameValue: string,
  usernameValue: string,
  passwordValue: string,
): User2Registration {
  const displayName = normalizeUser2DisplayName(displayNameValue)
  const username = normalizeUser2Username(usernameValue)
  const password = passwordValue
  if (password.length < 6) throw new Error('password_too_short')
  if (password.length > 128) throw new Error('password_too_long')
  return { displayName, username, password }
}

export function normalizeUser2Profile(displayNameValue: string, usernameValue: string): User2ProfileInput {
  return {
    displayName: normalizeUser2DisplayName(displayNameValue),
    username: normalizeUser2Username(usernameValue),
  }
}

export async function updateUser2Profile(
  backend: User2ProfileBackend,
  displayNameValue: string,
  usernameValue: string,
): Promise<{ displayName: string; username: string }> {
  return backend.update(normalizeUser2Profile(displayNameValue, usernameValue))
}

export async function upgradeGuestToUser2(
  backend: User1UpgradeBackend,
  displayNameValue: string,
  usernameValue: string,
  passwordValue: string,
): Promise<void> {
  const input = normalizeUser2Registration(displayNameValue, usernameValue, passwordValue)
  const upgraded = await backend.upgradeCurrentGuest(input)
  const loginUsername = normalizeUser2Username(upgraded.loginUsername || input.username)

  // Important: do not end/discard the guest profile here. The database RPC upgrades
  // the same anonymous auth user/profile in place so its conversation history remains intact.
  await backend.signInPersistentUser2(`${loginUsername}@taphoa.chat`, input.password)
  await backend.clearGuestAuthSession()
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
  if (password.length > 128) throw new Error('password_too_long')
  await backend.updatePassword(password)
}
