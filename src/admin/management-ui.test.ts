import { describe, expect, it } from 'vitest'
import adminMainSource from '../admin-main.ts?raw'
import managementSource from './management-ui.ts?raw'
import type { AdminInboxItem } from './contracts'
import { filterAdminInbox, formatAdminInboxTime } from './management-ui'

function item(partial: Partial<AdminInboxItem>): AdminInboxItem {
  return {
    conversationId: 'c',
    profileId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Nguyễn An',
    username: null,
    userLevel: 1,
    identityType: 'guest',
    address: null,
    customerLastSeenAt: null,
    lastMessageAt: '2026-09-02T07:30:00.000Z',
    lastMessageText: 'Xin chào',
    lastMessageType: 'text',
    unreadCount: 0,
    ...partial,
  }
}

describe('Admin management UI', () => {
  const rows = [
    item({ profileId: '11111111-1111-4111-8111-111111111111', displayName: 'Nguyễn An', userLevel: 1, unreadCount: 2 }),
    item({ profileId: '22222222-2222-4222-8222-222222222222', displayName: 'Bình Minh', userLevel: 2, username: 'khach_02' }),
  ]

  it('filters inbox by User2, guest and unread without creating another store', () => {
    expect(filterAdminInbox(rows, 'all')).toHaveLength(2)
    expect(filterAdminInbox(rows, 'user2').map((row) => row.userLevel)).toEqual([2])
    expect(filterAdminInbox(rows, 'guest').map((row) => row.userLevel)).toEqual([1])
    expect(filterAdminInbox(rows, 'unread').map((row) => row.unreadCount)).toEqual([2])
  })

  it('searches the current filter by display name or username', () => {
    expect(filterAdminInbox(rows, 'all', 'nguyễn').map((row) => row.displayName)).toEqual(['Nguyễn An'])
    expect(filterAdminInbox(rows, 'all', 'KHACH_02').map((row) => row.username)).toEqual(['khach_02'])
    expect(filterAdminInbox(rows, 'user2', 'bình').map((row) => row.userLevel)).toEqual([2])
    expect(filterAdminInbox(rows, 'guest', 'khach_02')).toEqual([])
  })

  it('formats inbox time into one stable short metadata value', () => {
    const now = new Date('2026-09-02T08:00:00.000Z')
    expect(formatAdminInboxTime('2026-09-02T07:30:00.000Z', now)).toBe('07:30')
    expect(formatAdminInboxTime(null, now)).toBe('')
  })

  it('keeps the product inbox renderer in one owner', () => {
    expect(managementSource).toContain('admin-inbox-row')
    expect(managementSource).toContain('admin-inbox-search')
    expect(adminMainSource).not.toContain("button.className = 'inbox-item'")
  })
})
