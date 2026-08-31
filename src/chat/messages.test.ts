import { describe, expect, it } from 'vitest'
import { mergeChatMessages, type ChatMessage } from './messages'

const base: ChatMessage = {
  id: '00000000-0000-0000-0000-000000000001',
  conversation_id: '10000000-0000-0000-0000-000000000001',
  sender_id: '20000000-0000-0000-0000-000000000001',
  client_message_id: '30000000-0000-0000-0000-000000000001',
  type: 'text',
  text: 'hello',
  reply_to_id: null,
  created_at: '2026-08-31T00:00:00Z',
  edited_at: null,
  revoked_at: null,
  call_id: null,
}

describe('chat message state', () => {
  it('deduplicates by message id and keeps chronological order', () => {
    const newer = { ...base, id: '00000000-0000-0000-0000-000000000002', created_at: '2026-08-31T00:00:02Z' }
    const updatedBase = { ...base, text: 'updated' }

    expect(mergeChatMessages([newer, base], [updatedBase])).toEqual([updatedBase, newer])
  })
})
