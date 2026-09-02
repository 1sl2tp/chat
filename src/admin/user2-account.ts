export interface AdminUser2CreateBackend {
  create(input: { username: string; password: string }): Promise<{ username: string }>
}

export interface AdminUser2CreateNamedBackend {
  create(input: {
    displayName: string
    username: string
    password: string
  }): Promise<{ displayName: string; username: string }>
}

export interface AdminGuestUpgradeBackend {
  upgrade(input: {
    profileId: string
    displayName: string
    username: string
    password: string
  }): Promise<{ username: string }>
}

export interface AdminUser2UpdateBackend {
  update(input: {
    profileId: string
    displayName: string
    username: string
  }): Promise<{ username: string }>
}

export interface AdminUser2ResetPasswordBackend {
  resetPassword(input: { profileId: string; password: string }): Promise<void>
}

export interface AdminUserDeleteBackend {
  deleteUser(profileId: string): Promise<void>
}

export interface AdminUser2Registration {
  displayName: string
  username: string
  password: string
}

function normalizeDisplayName(value: string): string {
  const displayName = value.trim()
  if (displayName.length < 1 || displayName.length > 50) throw new Error('invalid_display_name')
  return displayName
}

function normalizeUsername(value: string): string {
  const username = value.trim().replace(/^@+/, '').toLowerCase()
  if (username === 'admin') throw new Error('reserved_username')
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('invalid_username')
  return username
}

function normalizePassword(value: string): string {
  if (value.length < 6) throw new Error('password_too_short')
  if (value.length > 128) throw new Error('password_too_long')
  return value
}

function normalizeProfileId(value: string): string {
  const profileId = value.trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(profileId)) {
    throw new Error('invalid_profile_id')
  }
  return profileId
}

export function normalizeNewUser2(usernameValue: string, passwordValue: string): { username: string; password: string } {
  return {
    username: normalizeUsername(usernameValue),
    password: normalizePassword(passwordValue),
  }
}

export function normalizeAdminUser2Registration(
  displayNameValue: string,
  usernameValue: string,
  passwordValue: string,
): AdminUser2Registration {
  return {
    displayName: normalizeDisplayName(displayNameValue),
    username: normalizeUsername(usernameValue),
    password: normalizePassword(passwordValue),
  }
}

export async function createUser2FromAdmin(
  backend: AdminUser2CreateBackend,
  usernameValue: string,
  passwordValue: string,
): Promise<{ username: string }> {
  return backend.create(normalizeNewUser2(usernameValue, passwordValue))
}

export async function createUser2WithDisplayNameFromAdmin(
  backend: AdminUser2CreateNamedBackend,
  displayNameValue: string,
  usernameValue: string,
  passwordValue: string,
): Promise<{ displayName: string; username: string }> {
  return backend.create(normalizeAdminUser2Registration(displayNameValue, usernameValue, passwordValue))
}

export async function upgradeGuestFromAdmin(
  backend: AdminGuestUpgradeBackend,
  profileIdValue: string,
  displayNameValue: string,
  usernameValue: string,
  passwordValue: string,
): Promise<{ username: string }> {
  const account = normalizeAdminUser2Registration(displayNameValue, usernameValue, passwordValue)
  return backend.upgrade({ profileId: normalizeProfileId(profileIdValue), ...account })
}

export async function updateUser2FromAdmin(
  backend: AdminUser2UpdateBackend,
  profileIdValue: string,
  displayNameValue: string,
  usernameValue: string,
): Promise<{ username: string }> {
  return backend.update({
    profileId: normalizeProfileId(profileIdValue),
    displayName: normalizeDisplayName(displayNameValue),
    username: normalizeUsername(usernameValue),
  })
}

export async function resetUser2PasswordFromAdmin(
  backend: AdminUser2ResetPasswordBackend,
  profileIdValue: string,
  password: string,
  confirmation: string,
): Promise<void> {
  if (password !== confirmation) throw new Error('password_mismatch')
  await backend.resetPassword({
    profileId: normalizeProfileId(profileIdValue),
    password: normalizePassword(password),
  })
}

export async function deleteUserFromAdmin(
  backend: AdminUserDeleteBackend,
  profileIdValue: string,
): Promise<void> {
  await backend.deleteUser(normalizeProfileId(profileIdValue))
}
