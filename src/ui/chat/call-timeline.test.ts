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
  it('coalesces multiple status rows belonging to one call_id into one row', () => {
    const result = compactCallTimelineMessages([
      { ...base, id: 'c1a', client_message_id: 'cm1a', type: 'call', call_id: 'call-1', text: 'Đã từ chối', created_at: '2026-08-31T03:30:00.000Z' },
      { ...base, id: 'c1b', client_message_id: 'cm1b', type: 'call', call_id: 'call-1', text: 'Cuộc gọi đã hủy', created_at: '2026-08-31T03:30:02.000Z' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.text).toBe('📞 Cuộc gọi chưa kết nối')
    expect(result[0]?.call_id).toBe('call-1')
  })

  it('groups adjacent missed call sessions into one summary', () => {
    const result = compactCallTimelineMessages([
      { ...base, id: 'c1', client_message_id: 'cm1', type: 'call', call_id: 'call-1', text: 'Đã từ chối', created_at: '2026-08-31T03:30:00.000Z' },
      { ...base, id: 'c2', client_message_id: 'cm2', type: 'call', call_id: 'call-2', text: 'Cuộc gọi đã hủy', created_at: '2026-08-31T03:31:00.000Z' },
      { ...base, id: 'c3', client_message_id: 'cm3', type: 'call', call_id: 'call-3', text: 'Đã từ chối', created_at: '2026-08-31T03:32:00.000Z' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.text).toBe('📞 3 cuộc gọi chưa kết nối')
  })

  it('keeps completed calls separate from normalized missed calls', () => {
    const result = compactCallTimelineMessages([
      { ...base, id: 'c1', client_message_id: 'cm1', type: 'call', call_id: 'call-1', text: 'Cuộc gọi đã hủy' },
      { ...base, id: 'c2', client_message_id: 'cm2', type: 'call', call_id: 'call-2', text: 'Cuộc gọi thoại · 0:08' },
      { ...base, id: 'c3', client_message_id: 'cm3', type: 'call', call_id: 'call-3', text: 'Đã từ chối' },
    ])
    expect(result.map((message) => message.text)).toEqual([
      '📞 Cuộc gọi chưa kết nối',
      'Cuộc gọi thoại · 0:08',
      '📞 Cuộc gọi chưa kết nối',
    ])
  })
})
