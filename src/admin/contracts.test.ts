import { describe, expect, it } from 'vitest'
import { decodeAdminDetail, decodeAdminInbox } from './contracts'

describe('admin support payload decoding', () => {
  it('decodes User role metadata and preserves zero unread', () => {
    const result = decodeAdminInbox([{
      conversation_id: 'c1',
      profile_id: 'p1',
      display_name: null,
      username: null,
      user_level: 1,
      identity_type: 'guest',
      address: null,
      customer_last_seen_at: null,
      last_message_at: '2026-08-31T04:00:00Z',
      last_message_text: 'Xin chào',
      last_message_type: 'text',
      unread_count: 0,
    }])

    expect(result[0]?.displayName).toBeNull()
    expect(result[0]?.username).toBeNull()
    expect(result[0]?.userLevel).toBe(1)
    expect(result[0]?.address).toBeNull()
    expect(result[0]?.unreadCount).toBe(0)
  })

  it('decodes User2 detail metadata and empty device arrays safely', () => {
    const detail = decodeAdminDetail({
      conversation_id: 'c1',
      profile_id: 'p1',
      display_name: 'Lan',
      username: 'lan_01',
      user_level: 2,
      identity_type: 'taphoa',
      address: 'Hà Nội',
      devices: [],
    })

    expect(detail.devices).toEqual([])
    expect(detail.address).toBe('Hà Nội')
    expect(detail.username).toBe('lan_01')
    expect(detail.userLevel).toBe(2)
  })
})
