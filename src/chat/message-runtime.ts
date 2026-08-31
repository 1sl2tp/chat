import { mergeChatMessages, type ChatMessage } from './messages'

export type ChatRealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'error'

export interface ChatMessageRuntimeState {
  conversationId: string | null
  messages: ChatMessage[]
  realtime: ChatRealtimeStatus
  error: string | null
}

export interface ChatMessageBackend {
  loadMessages(conversationId: string): Promise<ChatMessage[]>
  subscribeMessages(
    conversationId: string,
    onMessage: (message: ChatMessage) => void,
    onStatus: (status: ChatRealtimeStatus, error?: Error) => void,
  ): () => void
  sendText(conversationId: string, clientMessageId: string, text: string): Promise<ChatMessage>
  markRead(conversationId: string): Promise<void>
}

let state: ChatMessageRuntimeState = {
  conversationId: null,
  messages: [],
  realtime: 'idle',
  error: null,
}

let stopSubscription: (() => void) | null = null
const listeners = new Set<(state: ChatMessageRuntimeState) => void>()

function publish(next: ChatMessageRuntimeState): void {
  state = next
  for (const listener of listeners) listener(state)
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

export async function startChatMessages(backend: ChatMessageBackend, supportEntry: unknown): Promise<void> {
  const conversationId = getSupportConversationId(supportEntry)
  stopSubscription?.()
  stopSubscription = null

  if (!conversationId) {
    publish({ conversationId: null, messages: [], realtime: 'idle', error: null })
    return
  }

  publish({ conversationId, messages: [], realtime: 'connecting', error: null })

  try {
    const loaded = await backend.loadMessages(conversationId)
    publish({ ...state, messages: mergeChatMessages([], loaded) })

    stopSubscription = backend.subscribeMessages(
      conversationId,
      (message) => publish({ ...state, messages: mergeChatMessages(state.messages, [message]) }),
      (realtime, error) => publish({ ...state, realtime, error: error?.message ?? null }),
    )

    await backend.markRead(conversationId)
  } catch (error) {
    publish({ ...state, realtime: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}

export async function sendChatText(
  backend: ChatMessageBackend,
  text: string,
  createId: () => string = () => crypto.randomUUID(),
): Promise<ChatMessage> {
  const conversationId = state.conversationId
  if (!conversationId) throw new Error('No active support conversation')

  const normalized = text.trim()
  if (!normalized) throw new Error('Message text is empty')

  const message = await backend.sendText(conversationId, createId(), normalized)
  publish({ ...state, messages: mergeChatMessages(state.messages, [message]) })
  return message
}

export function stopChatMessages(): void {
  stopSubscription?.()
  stopSubscription = null
  publish({ conversationId: null, messages: [], realtime: 'idle', error: null })
}
