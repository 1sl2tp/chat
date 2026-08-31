import { describe, expect, it, vi } from 'vitest'
import { createConversationSession, type ConversationBackend } from './conversation-session'
import type { ChatMessage } from './messages'

function message(id: string, conversationId: string, text = id): ChatMessage {
  return {
    id,
    conversation_id: conversationId,
    sender_id: 'sender-1',
    client_message_id: `client-${id}`,
    type: 'text',
    text,
    reply_to_id: null,
    created_at: `2026-08-31T00:00:${id.padStart(2, '0')}Z`,
    edited_at: null,
    revoked_at: null,
    call_id: null,
  }
}

function backend(overrides: Partial<ConversationBackend> = {}): ConversationBackend {
  return {
    loadMessages: vi.fn().mockResolvedValue([]),
    subscribeMessages: vi.fn((_conversationId, _onMessage, onStatus) => {
      onStatus('subscribed')
      return () => undefined
    }),
    sendText: vi.fn(async (conversationId, _clientMessageId, text) => message('9', conversationId, text)),
    markRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('ConversationSession', () => {
  it('keeps two active conversations isolated', async () => {
    let pushA: ((value: ChatMessage) => void) | undefined
    let pushB: ((value: ChatMessage) => void) | undefined
    const aBackend = backend({
      subscribeMessages: vi.fn((_id, onMessage) => {
        pushA = onMessage
        return () => undefined
      }),
    })
    const bBackend = backend({
      subscribeMessages: vi.fn((_id, onMessage) => {
        pushB = onMessage
        return () => undefined
      }),
    })

    const a = createConversationSession({ conversationId: 'a', backend: aBackend })
    const b = createConversationSession({ conversationId: 'b', backend: bBackend })
    await Promise.all([a.start(), b.start()])

    pushA?.(message('1', 'a'))
    pushB?.(message('2', 'b'))

    expect(a.getState().messages.map((item) => item.conversation_id)).toEqual(['a'])
    expect(b.getState().messages.map((item) => item.conversation_id)).toEqual(['b'])

    a.dispose()
    pushB?.(message('3', 'b'))
    expect(b.getState().messages.map((item) => item.id)).toEqual(['2', '3'])
  })

  it('ignores stale load and realtime callbacks after dispose', async () => {
    let resolveLoad!: (value: ChatMessage[]) => void
    let push!: (value: ChatMessage) => void
    const source = backend({
      loadMessages: vi.fn(() => new Promise<ChatMessage[]>((resolve) => { resolveLoad = resolve })),
      subscribeMessages: vi.fn((_id, onMessage) => {
        push = onMessage
        return () => undefined
      }),
    })
    const session = createConversationSession({ conversationId: 'a', backend: source })
    const starting = session.start()

    session.dispose()
    resolveLoad([message('1', 'a')])
    await starting
    push?.(message('2', 'a'))

    expect(session.getState().messages).toEqual([])
    expect(session.getState().phase).toBe('disposed')
  })

  it('deduplicates an rpc result repeated by realtime', async () => {
    let push!: (value: ChatMessage) => void
    const sent = message('5', 'a', 'hello')
    const source = backend({
      subscribeMessages: vi.fn((_id, onMessage) => {
        push = onMessage
        return () => undefined
      }),
      sendText: vi.fn().mockResolvedValue(sent),
    })
    const session = createConversationSession({ conversationId: 'a', backend: source, createId: () => 'client-5' })
    await session.start()

    await session.send('hello')
    push(sent)

    expect(session.getState().messages).toEqual([sent])
  })
})
