export const TEST_USER_LOGIN = 'test'
export const TEST_USER_EMAIL = 'test@taphoa.chat'
export const TEST_USER_PASSWORD = '123456'

export interface FixedTestUserAuthBackend {
  getCurrentUser(): Promise<{ email: string | null; isAnonymous: boolean } | null>
  signOut(): Promise<void>
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<boolean>
}

export async function ensureFixedTestUser(backend: FixedTestUserAuthBackend): Promise<void> {
  const current = await backend.getCurrentUser()

  if (current?.email === TEST_USER_EMAIL && !current.isAnonymous) return
  if (current) await backend.signOut()

  try {
    await backend.signIn(TEST_USER_EMAIL, TEST_USER_PASSWORD)
    return
  } catch {
    const hasSession = await backend.signUp(TEST_USER_EMAIL, TEST_USER_PASSWORD)
    if (!hasSession) await backend.signIn(TEST_USER_EMAIL, TEST_USER_PASSWORD)
  }
}
