import { describe, expect, it } from 'vitest'
import { createConversationSession, type ConversationBackend } from './conversation-session'
import type { ChatMessage } from './messages'

class FakeConversationHub {
  private messages: ChatMessage[] = []
  private listeners = new Set<(message: ChatMessage) => void>()
  private sequence = 0

  client(senderId: string): ConversationBackend {
    return {
      loadMessages: async (conversationId) => this.messages.filter((item) => item.conversation_id === conversationId),
      subscribeMessages: (conversationId, onMessage, onStatus) => {
        const listener = (message: ChatMessage) => {
          if (message.conversation_id === conversationId) onMessage(message)
        }
        this.listeners.add(listener)
        onStatus('subscribed')
        return () => this.listeners.delete(listener)
      },
      sendText: async (conversationId, clientMessageId, text) => {
        this.sequence += 1
        const id = String(this.sequence)
        const message: ChatMessage = {
          id,
          conversation_id: conversationId,
          sender_id: senderId,
          client_message_id: clientMessageId,
          type: 'text',
          text,
          reply_to_id: null,
          created_at: `2026-08-31T00:00:${id.padStart(2, '0')}Z`,
          edited_at: null,
          revoked_at: null,
          call_id: null,
        }
        this.messages.push(message)
        for (const listener of this.listeners) listener(message)
        return message
      },
      markRead: async () => undefined,
    }
  }
}

describe('simulated User <-> Admin chat flow', () => {
  it('delivers a user message to Admin and an Admin reply back to User exactly once', async () => {
    const hub = new FakeConversationHub()
    const user = createConversationSession({
      conversationId: 'support-1',
      backend: hub.client('user-1'),
      createId: () => 'user-client-1',
    })
    const admin = createConversationSession({
      conversationId: 'support-1',
      backend: hub.client('admin-1'),
      createId: () => 'admin-client-1',
    })

    await Promise.all([user.start(), admin.start()])

    await user.send('Xin chào Admin')

    expect(user.getState().messages.map((item) => item.text)).toEqual(['Xin chào Admin'])
    expect(admin.getState().messages.map((item) => item.text)).toEqual(['Xin chào Admin'])

    await admin.send('Admin đã nhận được tin')

    expect(user.getState().messages.map((item) => item.text)).toEqual([
      'Xin chào Admin',
      'Admin đã nhận được tin',
    ])
    expect(admin.getState().messages.map((item) => item.text)).toEqual([
      'Xin chào Admin',
      'Admin đã nhận được tin',
    ])
    expect(user.getState().messages).toHaveLength(2)
    expect(admin.getState().messages).toHaveLength(2)
  })
})
