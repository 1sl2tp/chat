const STORAGE_KEY = 'taphoa.chat.bootstrap.v1'

export interface CachedChatBootstrap {
  identity: unknown
  supportEntry: unknown
}

export function readChatBootstrapCache(storage: Storage = localStorage): CachedChatBootstrap | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedChatBootstrap
    if (!parsed || typeof parsed !== 'object') return null
    return {
      identity: parsed.identity ?? null,
      supportEntry: parsed.supportEntry ?? null,
    }
  } catch {
    return null
  }
}

export function writeChatBootstrapCache(
  value: CachedChatBootstrap,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Bootstrap cache is only a fast path; storage failure must never block chat.
  }
}

export function clearChatBootstrapCache(storage: Storage = localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}
