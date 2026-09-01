import { ensureFixedTestUser, type FixedTestUserAuthBackend } from './fixed-auth'

export async function prepareFixedTestRuntime(
  backend: FixedTestUserAuthBackend,
  startChatRuntime: () => Promise<void>,
): Promise<void> {
  await ensureFixedTestUser(backend)
  await startChatRuntime()
}
