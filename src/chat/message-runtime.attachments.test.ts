import { afterEach, describe, expect, it } from 'vitest'
import type { AttachmentTransport } from './attachments/controller'
import { getChatMessageState, sendChatAttachment, startChatMessagesForConversation, stopChatMessages, type ChatMessageBackend } from './message-runtime'

const backend: ChatMessageBackend = {
  async loadMessages() { return [] },
  subscribeMessages(_conversationId, _onMessage, onStatus) {
    onStatus('subscribed')
    return () => {}
  },
  async sendText() { throw new Error('unused') },
  async markRead() {},
}

afterEach(() => stopChatMessages())

describe('attachment send flow', () => {
  it('publishes the sent attachment into the canonical message state', async () => {
    await startChatMessagesForConversation(backend, 'c1')
    const file = { name: 'photo.png', type: 'image/png', size: 10 } as File
    const transport: AttachmentTransport = {
      async upload() {},
      async remove() {},
      async send(input) {
        return {
          id: 'm-photo',
          conversation_id: input.conversationId,
          sender_id: 'p1',
          client_message_id: input.clientMessageId,
          type: input.type,
          text: null,
          reply_to_id: null,
          created_at: '2026-09-02T00:00:00.000Z',
          edited_at: null,
          revoked_at: null,
          call_id: null,
          attachment: input.attachment,
        }
      },
    }

    await sendChatAttachment(transport, 'p1', file, () => 'cm-photo')

    expect(getChatMessageState().messages).toHaveLength(1)
    expect(getChatMessageState().messages[0]).toMatchObject({ id: 'm-photo', type: 'image' })
  })
})
