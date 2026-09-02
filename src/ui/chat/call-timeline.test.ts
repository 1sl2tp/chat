import { describe, expect, it } from 'vitest'
import { compactCallTimelineMessages } from './call-timeline'

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

describe('call timeline presentation', () => {
  it('groups consecutive cancelled and declined calls into one missed-call summary', () => {
    const result = compactCallTimelineMessages([
      { ...base, id: 'c1', type: 'call', text: 'Đã từ chối', created_at: '2026-08-31T03:30:00.000Z' },
      { ...base, id: 'c2', type: 'call', text: 'Cuộc gọi đã hủy', created_at: '2026-08-31T03:31:00.000Z' },
      { ...base, id: 'c3', type: 'call', text: 'Đã từ chối', created_at: '2026-08-31T03:32:00.000Z' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.text).toBe('📞 3 cuộc gọi chưa kết nối')
    expect(result[0]?.created_at).toBe('2026-08-31T03:32:00.000Z')
  })

  it('stops grouping at normal chat messages and completed calls', () => {
    const result = compactCallTimelineMessages([
      { ...base, id: 'c1', type: 'call', text: 'Đã từ chối' },
      { ...base, id: 't1', type: 'text', text: 'Alo' },
      { ...base, id: 'c2', type: 'call', text: 'Cuộc gọi thoại · 0:08' },
      { ...base, id: 'c3', type: 'call', text: 'Cuộc gọi đã hủy' },
    ])
    expect(result.map((message) => message.text)).toEqual([
      'Đã từ chối',
      'Alo',
      'Cuộc gọi thoại · 0:08',
      'Cuộc gọi đã hủy',
    ])
  })
})
