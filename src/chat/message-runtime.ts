import { getRuntimeMessageCache, type MessageCache } from './message-cache'
import {
  getNewestMessage,
  getOldestMessage,
  mergeChatMessages,
  type ChatMessage,
} from './messages'

export type ChatRealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'error'
export type MessageChangeKind =
  | 'reset'
  | 'cache'
  | 'sync'
  | 'realtime'
  | 'self-send'
  | 'ack'
  | 'failed'
  | 'older'

export interface ChatMessageChange {
  kind: MessageChangeKind
  count: number
}

export interface ChatMessageRuntimeState {
  conversationId: string | null
  messages: ChatMessage[]
  realtime: ChatRealtimeStatus
  syncing: boolean
  isLoadingOlder: boolean
  hasOlder: boolean
  messageRevision: number
  lastChange: ChatMessageChange | null
  error: string | null
}

export interface ChatMessageBackend {
  /**
   * Latest page only. Do not return an unbounded conversation history.
   */
  loadMessages(conversationId: string): Promise<ChatMessage[]>
  loadMessagesAfter?(conversationId: string, createdAt: string): Promise<ChatMessage[]>
  loadMessagesBefore?(conversationId: string, createdAt: string): Promise<ChatMessage[]>
  subscribeMessages(
    conversationId: string,
    onMessage: (message: ChatMessage) => void,
    onStatus: (status: ChatRealtimeStatus, error?: Error) => void,
  ): () => void
  sendText(conversationId: string, clientMessageId: string, text: string): Promise<ChatMessage>
  markRead(conversationId: string): Promise<void>
}

const PAGE_SIZE = 50

let state: ChatMessageRuntimeState = {
  conversationId: null,
  messages: [],
  realtime: 'idle',
  syncing: false,
  isLoadingOlder: false,
  hasOlder: true,
  messageRevision: 0,
  lastChange: null,
  error: null,
}

let stopSubscription: (() => void) | null = null
let activeBackend: ChatMessageBackend | null = null
let activeCache: MessageCache | null = null
let generation = 0
let syncInFlight = false
let olderInFlight = false
const listeners = new Set<(state: ChatMessageRuntimeState) => void>()

function publish(next: ChatMessageRuntimeState): void {
  state = next
  for (const listener of listeners) listener(state)
}

function messagesEqual(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (
      left.id !== right.id ||
      left.client_message_id !== right.client_message_id ||
      left.text !== right.text ||
      left.edited_at !== right.edited_at ||
      left.revoked_at !== right.revoked_at ||
      left.local_status !== right.local_status ||
      left.local_error !== right.local_error
    ) {
      return false
    }
  }
  return true
}

function persistSnapshot(): void {
  if (!activeCache || !state.conversationId) return
  void activeCache.save(state.conversationId, state.messages).catch(() => {
    // Cache failure must never block chat.
  })
}

function applyMessages(incoming: ChatMessage[], kind: MessageChangeKind): number {
  if (incoming.length === 0) return 0
  const merged = mergeChatMessages(state.messages, incoming)
  if (messagesEqual(state.messages, merged)) return 0

  const previousKeys = new Set(state.messages.map((message) => message.client_message_id || message.id))
  const count = merged.reduce((total, message) => {
    const key = message.client_message_id || message.id
    return total + (previousKeys.has(key) ? 0 : 1)
  }, 0)

  publish({
    ...state,
    messages: merged,
    messageRevision: state.messageRevision + 1,
    lastChange: { kind, count },
  })
  persistSnapshot()
  return count
}

export function getChatMessageState(): ChatMessageRuntimeState {
  return state
}

export function subscribeChatMessages(listener: (state: ChatMessageRuntimeState) => void): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

export function getSupportConversationId(supportEntry: unknown): string | null {
  if (!supportEntry || typeof supportEntry !== 'object') return null
  const candidate = (supportEntry as { conversation_id?: unknown }).conversation_id
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

export async function hydrateChatMessagesFromCache(
  conversationId: string | null,
  cache: MessageCache = getRuntimeMessageCache(),
): Promise<void> {
  const run = ++generation
  stopSubscription?.()
  stopSubscription = null
  activeBackend = null
  activeCache = cache
  syncInFlight = false
  olderInFlight = false

  if (!conversationId) return

  const cached = await cache.load(conversationId).catch(() => [])
  if (run !== generation) return

  publish({
    conversationId,
    messages: mergeChatMessages([], cached),
    realtime: 'idle',
    syncing: false,
    isLoadingOlder: false,
    hasOlder: true,
    messageRevision: state.messageRevision + 1,
    lastChange: { kind: 'cache', count: cached.length },
    error: null,
  })
}

export async function startChatMessagesForConversation(
  backend: ChatMessageBackend,
  conversationId: string | null,
  cache: MessageCache = getRuntimeMessageCache(),
): Promise<void> {
  const run = ++generation
  stopSubscription?.()
  stopSubscription = null
  activeBackend = backend
  activeCache = cache
  syncInFlight = false
  olderInFlight = false

  if (!conversationId) {
    publish({
      conversationId: null,
      messages: [],
      realtime: 'idle',
      syncing: false,
      isLoadingOlder: false,
      hasOlder: true,
      messageRevision: state.messageRevision + 1,
      lastChange: { kind: 'reset', count: 0 },
      error: null,
    })
    return
  }

  const seedMessages = state.conversationId === conversationId ? state.messages : []

  publish({
    conversationId,
    messages: seedMessages,
    realtime: 'connecting',
    syncing: true,
    isLoadingOlder: false,
    hasOlder: true,
    messageRevision: state.messageRevision + 1,
    lastChange: { kind: 'reset', count: 0 },
    error: null,
  })

  // Subscribe first so messages arriving during local/network hydration are not lost.
  stopSubscription = backend.subscribeMessages(
    conversationId,
    (message) => {
      if (run !== generation || state.conversationId !== conversationId) return
      if (message.conversation_id !== conversationId) return
      applyMessages([{ ...message, local_status: 'sent', local_error: null }], 'realtime')
    },
    (realtime, error) => {
      if (run !== generation || state.conversationId !== conversationId) return
      publish({ ...state, realtime, error: error?.message ?? state.error })
    },
  )

  const cachedPromise = cache.load(conversationId).catch(() => [])
  const latestPromise = backend.loadMessages(conversationId)

  try {
    const cached = await cachedPromise
    if (run !== generation || state.conversationId !== conversationId) return
    applyMessages(cached, 'cache')

    const loaded = await latestPromise
    if (run !== generation || state.conversationId !== conversationId) return
    applyMessages(
      loaded.map((message) => ({ ...message, local_status: 'sent' as const, local_error: null })),
      'sync',
    )

    publish({
      ...state,
      syncing: false,
      hasOlder: loaded.length >= PAGE_SIZE,
      error: null,
    })
    persistSnapshot()

    void backend.markRead(conversationId).catch(() => {
      // Read state is secondary; never block rendering.
    })
  } catch (error) {
    if (run !== generation || state.conversationId !== conversationId) return
    publish({
      ...state,
      syncing: false,
      realtime: state.realtime === 'subscribed' ? 'subscribed' : 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function startChatMessages(backend: ChatMessageBackend, supportEntry: unknown): Promise<void> {
  return startChatMessagesForConversation(backend, getSupportConversationId(supportEntry))
}

export async function syncChatMessages(): Promise<void> {
  if (!activeBackend || !state.conversationId || syncInFlight) return
  const run = generation
  const conversationId = state.conversationId
  syncInFlight = true
  publish({ ...state, syncing: true })

  try {
    const newest = getNewestMessage(state.messages)
    const loaded =
      newest && activeBackend.loadMessagesAfter
        ? await activeBackend.loadMessagesAfter(conversationId, newest.created_at)
        : await activeBackend.loadMessages(conversationId)

    if (run !== generation || state.conversationId !== conversationId) return
    applyMessages(
      loaded.map((message) => ({ ...message, local_status: 'sent' as const, local_error: null })),
      'sync',
    )
    publish({ ...state, syncing: false, error: null })
    persistSnapshot()
  } catch (error) {
    if (run === generation && state.conversationId === conversationId) {
      publish({
        ...state,
        syncing: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    syncInFlight = false
  }
}

export async function loadOlderChatMessages(): Promise<void> {
  if (!activeBackend?.loadMessagesBefore || !state.conversationId || olderInFlight || !state.hasOlder) return
  const oldest = getOldestMessage(state.messages)
  if (!oldest) return

  const run = generation
  const conversationId = state.conversationId
  olderInFlight = true
  publish({ ...state, isLoadingOlder: true })

  try {
    const loaded = await activeBackend.loadMessagesBefore(conversationId, oldest.created_at)
    if (run !== generation || state.conversationId !== conversationId) return

    applyMessages(
      loaded.map((message) => ({ ...message, local_status: 'sent' as const, local_error: null })),
      'older',
    )
    publish({
      ...state,
      isLoadingOlder: false,
      hasOlder: loaded.length >= PAGE_SIZE,
      error: null,
    })
    persistSnapshot()
  } catch (error) {
    if (run === generation && state.conversationId === conversationId) {
      publish({
        ...state,
        isLoadingOlder: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    olderInFlight = false
  }
}

export async function sendChatText(
  backend: ChatMessageBackend,
  text: string,
  createId: () => string = () => crypto.randomUUID(),
  senderId = 'local-self',
): Promise<ChatMessage> {
  const conversationId = state.conversationId
  if (!conversationId) throw new Error('No active support conversation')

  const normalized = text.trim()
  if (!normalized) throw new Error('Message text is empty')

  const clientMessageId = createId()
  const pending: ChatMessage = {
    id: `local:${clientMessageId}`,
    conversation_id: conversationId,
    sender_id: senderId,
    client_message_id: clientMessageId,
    type: 'text',
    text: normalized,
    reply_to_id: null,
    created_at: new Date().toISOString(),
    edited_at: null,
    revoked_at: null,
    call_id: null,
    local_status: 'sending',
    local_error: null,
  }

  applyMessages([pending], 'self-send')

  try {
    const message = await backend.sendText(conversationId, clientMessageId, normalized)
    const confirmed: ChatMessage = {
      ...message,
      local_status: 'sent',
      local_error: null,
    }
    applyMessages([confirmed], 'ack')
    return confirmed
  } catch (error) {
    const failed: ChatMessage = {
      ...pending,
      local_status: 'failed',
      local_error: error instanceof Error ? error.message : String(error),
    }
    applyMessages([failed], 'failed')
    throw error
  }
}

export function stopChatMessages(): void {
  generation += 1
  stopSubscription?.()
  stopSubscription = null
  activeBackend = null
  activeCache = null
  syncInFlight = false
  olderInFlight = false
  publish({
    conversationId: null,
    messages: [],
    realtime: 'idle',
    syncing: false,
    isLoadingOlder: false,
    hasOlder: true,
    messageRevision: state.messageRevision + 1,
    lastChange: { kind: 'reset', count: 0 },
    error: null,
  })
}
