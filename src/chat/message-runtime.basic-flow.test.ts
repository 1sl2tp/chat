import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getChatMessageState,
  sendChatText,
  startChatMessagesForConversation,
  stopChatMessages,
  type ChatMessageBackend,
} from './message-runtime'
import type { ChatMessage } from './messages'

function makeMessage(id: string, senderId: string, text: string): ChatMessage {
  return {
    id,
    conversation_id: 'support-1',
    sender_id: senderId,
    client_message_id: `client-${id}`,
    type: 'text',
    text,
    reply_to_id: null,
    created_at: `2026-08-31T00:00:0${id}Z`,
    edited_at: null,
    revoked_at: null,
    call_id: null,
  }
}

describe('basic one User ↔ one Admin text flow', () => {
  afterEach(() => stopChatMessages())

  it('User sends one message, Admin reply arrives, and neither message is duplicated', async () => {
    let onRealtimeMessage: (message: ChatMessage) => void = () => {
      throw new Error('Realtime subscription was not installed')
    }
    const userMessage = makeMessage('1', 'user-1', 'xin chao admin')
    const adminReply = makeMessage('2', 'admin-1', 'chao ban')

    const backend: ChatMessageBackend = {
      loadMessages: vi.fn().mockResolvedValue([]),
      subscribeMessages: vi.fn((_conversationId, onMessage, onStatus) => {
        onRealtimeMessage = onMessage
        onStatus('subscribed')
        return () => undefined
      }),
      sendText: vi.fn().mockResolvedValue(userMessage),
      markRead: vi.fn().mockResolvedValue(undefined),
    }

    await startChatMessagesForConversation(backend, 'support-1')
    await sendChatText(backend, 'xin chao admin', () => 'client-1')

    onRealtimeMessage(userMessage)
    onRealtimeMessage(adminReply)

    expect(getChatMessageState().messages.map((item) => item.text)).toEqual([
      'xin chao admin',
      'chao ban',
    ])
    expect(getChatMessageState().messages).toHaveLength(2)
  })
})
