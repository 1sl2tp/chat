import type { ChatMessage } from './messages'

const DB_NAME = 'taphoa-chat-cache'
const DB_VERSION = 1
const STORE_NAME = 'conversation_messages'
const MAX_CACHED_MESSAGES = 200

export interface MessageCache {
  load(conversationId: string): Promise<ChatMessage[]>
  save(conversationId: string, messages: ChatMessage[]): Promise<void>
}

interface CachedConversation {
  conversationId: string
  updatedAt: number
  messages: ChatMessage[]
}

const noopCache: MessageCache = {
  async load() {
    return []
  },
  async save() {
    return undefined
  },
}

let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'conversationId' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open chat cache'))
  })

  return databasePromise
}

function trimForCache(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_CACHED_MESSAGES)
}

function createIndexedDbCache(): MessageCache {
  return {
    async load(conversationId) {
      const database = await openDatabase()
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly')
        const request = transaction.objectStore(STORE_NAME).get(conversationId)
        request.onsuccess = () => {
          const value = request.result as CachedConversation | undefined
          resolve(value?.messages ?? [])
        }
        request.onerror = () => reject(request.error ?? new Error('Unable to read chat cache'))
      })
    },

    async save(conversationId, messages) {
      const database = await openDatabase()
      const record: CachedConversation = {
        conversationId,
        updatedAt: Date.now(),
        messages: trimForCache(messages),
      }

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        transaction.objectStore(STORE_NAME).put(record)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save chat cache'))
        transaction.onabort = () => reject(transaction.error ?? new Error('Chat cache write aborted'))
      })
    },
  }
}

let runtimeCache: MessageCache | null = null

export function getRuntimeMessageCache(): MessageCache {
  if (runtimeCache) return runtimeCache
  runtimeCache = typeof indexedDB === 'undefined' ? noopCache : createIndexedDbCache()
  return runtimeCache
}

export function createNoopMessageCache(): MessageCache {
  return noopCache
}
