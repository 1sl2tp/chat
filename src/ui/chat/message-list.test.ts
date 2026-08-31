import { describe, expect, it } from 'vitest'
import { toMessagePresentation } from './message-list'

const base = {
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'p1',
  client_message_id: 'cm1',
  type: 'text',
  text: 'Xin chào',
  reply_to_id: null,
  created_at: '2026-08-31T03:30:00.000Z',
  edited_at: null,
  revoked_at: null,
  call_id: null,
}

describe('message presentation', () => {
  it('marks the current customer message as outgoing', () => {
    expect(toMessagePresentation(base, 'p1').direction).toBe('outgoing')
  })

  it('marks another sender as incoming', () => {
    expect(toMessagePresentation(base, 'admin').direction).toBe('incoming')
  })

  it('shows revoked state without exposing old text', () => {
    const result = toMessagePresentation({ ...base, revoked_at: '2026-08-31T03:31:00.000Z' }, 'p1')
    expect(result.revoked).toBe(true)
    expect(result.text).toBe('Tin nhắn đã được thu hồi')
  })
})
