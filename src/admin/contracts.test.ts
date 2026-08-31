import { describe, expect, it } from 'vitest'
import { decodeAdminDetail, decodeAdminInbox } from './contracts'

describe('admin support payload decoding', () => {
  it('decodes guest inbox rows and preserves zero unread', () => {
    const result = decodeAdminInbox([{
      conversation_id: 'c1',
      profile_id: 'p1',
      display_name: null,
      identity_type: 'anonymous',
      address: null,
      customer_last_seen_at: null,
      last_message_at: '2026-08-31T04:00:00Z',
      last_message_text: 'Xin chào',
      last_message_type: 'text',
      unread_count: 0,
    }])

    expect(result[0]?.displayName).toBeNull()
    expect(result[0]?.address).toBeNull()
    expect(result[0]?.unreadCount).toBe(0)
  })

  it('decodes empty device arrays safely', () => {
    const detail = decodeAdminDetail({
      conversation_id: 'c1',
      profile_id: 'p1',
      display_name: 'Lan',
      identity_type: 'taphoa',
      address: 'Hà Nội',
      devices: [],
    })

    expect(detail.devices).toEqual([])
    expect(detail.address).toBe('Hà Nội')
  })
})
