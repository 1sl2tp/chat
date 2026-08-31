export interface ChatBootstrapBackend {
  hasSession(): Promise<boolean>
  signInAnonymously(): Promise<void>
  bootstrapIdentity(input: { deviceKey: string; label: string; platform: string }): Promise<unknown>
  getSupportEntry(): Promise<unknown>
}

export interface ChatBootstrapInput {
  deviceKey: string
  label: string
  platform: string
}

export interface ChatBootstrapResult {
  createdAnonymousSession: boolean
  identity: unknown
  supportEntry: unknown
}

export async function bootstrapChat(
  backend: ChatBootstrapBackend,
  input: ChatBootstrapInput,
): Promise<ChatBootstrapResult> {
  const hasSession = await backend.hasSession()

  if (!hasSession) {
    await backend.signInAnonymously()
  }

  const identity = await backend.bootstrapIdentity(input)
  const supportEntry = await backend.getSupportEntry()

  return {
    createdAnonymousSession: !hasSession,
    identity,
    supportEntry,
  }
}
