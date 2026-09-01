import { describe, expect, it } from 'vitest'
import { getChatMessageState, startChatMessagesForConversation } from './message-runtime'
import { stopChatRuntime } from './runtime'
import { getChatRuntimeState, setChatRuntimeState } from './store'

describe('chat runtime lifecycle', () => {
  it('disposes the active conversation and resets bootstrap state before switching user modes', async () => {
    let disposed = 0

    await startChatMessagesForConversation({
      loadMessages: async () => [],
      subscribeMessages: () => () => { disposed += 1 },
      sendText: async () => { throw new Error('not used') },
      markRead: async () => {},
    }, 'conversation-1')

    setChatRuntimeState({
      phase: 'ready',
      identity: { profile: { id: 'profile-1' } },
      supportEntry: { conversation_id: 'conversation-1' },
      error: null,
    })

    stopChatRuntime()

    expect(disposed).toBe(1)
    expect(getChatMessageState()).toEqual({
      conversationId: null,
      messages: [],
      realtime: 'idle',
      error: null,
    })
    expect(getChatRuntimeState()).toEqual({
      phase: 'idle',
      identity: null,
      supportEntry: null,
      error: null,
    })
  })
})
