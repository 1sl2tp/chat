import { TEST_USER_EMAIL, TEST_USER_LOGIN, TEST_USER_PASSWORD } from './fixed-auth'

export interface FixedRootUserBackend {
  getCurrentUser(): Promise<{ email: string | null; isAnonymous: boolean } | null>
  signOut(): Promise<void>
  signIn(email: string, password: string): Promise<void>
  signInAnonymously(): Promise<void>
  upgradeCurrentUser(displayName: string, username: string, password: string): Promise<void>
  refreshSession(): Promise<void>
}

export async function prepareFixedTestRuntime(
  backend: FixedRootUserBackend,
  startChatRuntime: () => Promise<void>,
): Promise<void> {
  const current = await backend.getCurrentUser()

  if (current?.email === TEST_USER_EMAIL && !current.isAnonymous) {
    await startChatRuntime()
    return
  }

  if (current) await backend.signOut()

  try {
    await backend.signIn(TEST_USER_EMAIL, TEST_USER_PASSWORD)
    await startChatRuntime()
    return
  } catch {
    // The fixed User 2 does not exist yet. Create exactly one temporary
    // anonymous session, resolve its chat profile, then upgrade that same
    // profile through the existing business RPC. Public email signup is not
    // used, so email confirmation/rate limits cannot block the root page.
  }

  await backend.signInAnonymously()
  await startChatRuntime()
  await backend.upgradeCurrentUser(TEST_USER_LOGIN, TEST_USER_LOGIN, TEST_USER_PASSWORD)
  await backend.refreshSession()
}
