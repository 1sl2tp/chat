export type RootUserMode = 'guest' | 'user2'

export interface RootSessionBackend {
  getUser2Session(): Promise<{ isAnonymous: boolean } | null>
  clearUser2Session(): Promise<void>
}

export interface FreshGuestBackend {
  endGuest(): Promise<void>
  startGuest(): Promise<void>
}

export async function resolveRootMode(backend: RootSessionBackend): Promise<RootUserMode> {
  const session = await backend.getUser2Session()
  if (!session) return 'guest'
  if (!session.isAnonymous) return 'user2'

  await backend.clearUser2Session()
  return 'guest'
}

export async function enterFreshGuest(backend: FreshGuestBackend): Promise<void> {
  await backend.endGuest()
  await backend.startGuest()
}
