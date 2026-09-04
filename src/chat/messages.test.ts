import { describe, expect, it } from 'vitest'
import { mergeChatMessages, type ChatMessage } from './messages'

function msg(id: string, clientId: string, status?: ChatMessage['local_status']): ChatMessage {
  return {
    id,
    conversation_id: 'c1',
    sender_id: 'u1',
    client_message_id: clientId,
    type: 'text',
    text: 'hello',
    reply_to_id: null,
    created_at: '2026-09-04T00:00:00.000Z',
    edited_at: null,
    revoked_at: null,
    call_id: null,
    local_status: status,
  }
}

describe('message merge', () => {
  it('replaces an optimistic local row with the server row by client_message_id', () => {
    const pending = msg('local:abc', 'abc', 'sending')
    const confirmed = msg('server-1', 'abc', 'sent')

    const merged = mergeChatMessages([pending], [confirmed])

    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('server-1')
    expect(merged[0].local_status).toBe('sent')
  })

  it('deduplicates a realtime echo of the same server message', () => {
    const confirmed = msg('server-1', 'abc', 'sent')
    expect(mergeChatMessages([confirmed], [confirmed])).toHaveLength(1)
  })
})
