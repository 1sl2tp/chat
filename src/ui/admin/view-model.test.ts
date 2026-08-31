import { describe, expect, it } from 'vitest'
import { getAdminCustomerLabel, getAdminDeviceLines, getAdminEmptyMessage, getAdminStatusLabel } from './view-model'

describe('admin workspace view model', () => {
  it('uses stable guest label when display name is missing', () => {
    expect(getAdminCustomerLabel({ displayName: null, profileId: '12345678-abcd' })).toBe('Khách 123456')
  })

  it('uses customer display name when present', () => {
    expect(getAdminCustomerLabel({ displayName: ' Lan ', profileId: '123' })).toBe('Lan')
  })

  it('labels anonymous customers as guests', () => {
    expect(getAdminStatusLabel('anonymous')).toBe('Khách vãng lai')
  })

  it('shows a clear message when admin auth session is missing', () => {
    expect(getAdminEmptyMessage('error', 'admin_session_required')).toBe('Bạn chưa đăng nhập Admin.')
  })

  it('keeps a generic message for other admin load failures', () => {
    expect(getAdminEmptyMessage('error', 'admin_required')).toBe('Không thể tải khu vực Admin.')
  })

  it('formats device metadata without inventing missing fields', () => {
    expect(getAdminDeviceLines({
      conversationId: 'c1', profileId: 'p1', displayName: null, identityType: 'anonymous', address: null,
      customerLastSeenAt: null,
      devices: [{ id: 'd1', label: 'PWA', platform: 'ios', firstSeenAt: null, lastSeenAt: null, revokedAt: null }],
    })).toEqual(['PWA · ios'])
  })
})
