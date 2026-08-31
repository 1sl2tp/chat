import { mergeChatMessages, type ChatMessage } from './messages'

export type ConversationRealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'error'
export type ConversationPhase = 'idle' | 'loading' | 'ready' | 'error' | 'disposed'

export interface ConversationState {
  conversationId: string
  phase: ConversationPhase
  messages: ChatMessage[]
  realtime: ConversationRealtimeStatus
  error: string | null
}

export interface ConversationBackend {
  loadMessages(conversationId: string): Promise<ChatMessage[]>
  subscribeMessages(
    conversationId: string,
    onMessage: (message: ChatMessage) => void,
    onStatus: (status: ConversationRealtimeStatus, error?: Error) => void,
  ): () => void
  sendText(conversationId: string, clientMessageId: string, text: string): Promise<ChatMessage>
  markRead(conversationId: string): Promise<void>
}

export interface ConversationSession {
  getState(): ConversationState
  subscribe(listener: (state: ConversationState) => void): () => void
  start(): Promise<void>
  send(text: string): Promise<ChatMessage>
  markRead(): Promise<void>
  dispose(): void
}

interface ConversationSessionOptions {
  conversationId: string
  backend: ConversationBackend
  createId?: () => string
}

export function createConversationSession({
  conversationId,
  backend,
  createId = () => crypto.randomUUID(),
}: ConversationSessionOptions): ConversationSession {
  let state: ConversationState = {
    conversationId,
    phase: 'idle',
    messages: [],
    realtime: 'idle',
    error: null,
  }
  let generation = 0
  let stopSubscription: (() => void) | null = null
  const listeners = new Set<(state: ConversationState) => void>()

  const publish = (next: ConversationState) => {
    state = next
    for (const listener of listeners) listener(state)
  }

  const isCurrent = (run: number) => run === generation && state.phase !== 'disposed'

  const stopRealtime = () => {
    stopSubscription?.()
    stopSubscription = null
  }

  return {
    getState() {
      return state
    },

    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },

    async start() {
      stopRealtime()
      const run = ++generation
      publish({ ...state, phase: 'loading', messages: [], realtime: 'connecting', error: null })

      try {
        // Subscribe before loading. Events arriving during load are merged into state,
        // then the load result is merged with them so the load/subscribe boundary has no gap.
        stopSubscription = backend.subscribeMessages(
          conversationId,
          (incoming) => {
            if (!isCurrent(run) || incoming.conversation_id !== conversationId) return
            publish({ ...state, messages: mergeChatMessages(state.messages, [incoming]) })
          },
          (realtime, error) => {
            if (!isCurrent(run)) return
            publish({ ...state, realtime, error: error?.message ?? null })
          },
        )

        const loaded = await backend.loadMessages(conversationId)
        if (!isCurrent(run)) return
        publish({
          ...state,
          phase: 'ready',
          messages: mergeChatMessages(loaded, state.messages),
          error: null,
        })

        await backend.markRead(conversationId)
      } catch (error) {
        if (!isCurrent(run)) return
        stopRealtime()
        publish({
          ...state,
          phase: 'error',
          realtime: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },

    async send(text) {
      if (state.phase === 'disposed') throw new Error('Conversation session is disposed')
      const normalized = text.trim()
      if (!normalized) throw new Error('Message text is empty')

      const message = await backend.sendText(conversationId, createId(), normalized)
      if (state.phase !== 'disposed' && message.conversation_id === conversationId) {
        publish({ ...state, messages: mergeChatMessages(state.messages, [message]) })
      }
      return message
    },

    async markRead() {
      if (state.phase === 'disposed') return
      await backend.markRead(conversationId)
    },

    dispose() {
      generation += 1
      stopRealtime()
      publish({ ...state, phase: 'disposed', realtime: 'idle', error: null })
      listeners.clear()
    },
  }
}
