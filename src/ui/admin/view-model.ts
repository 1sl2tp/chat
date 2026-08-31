import type { AdminInboxItem, AdminSupportDetail } from '../../admin/contracts'

export function getAdminCustomerLabel(item: Pick<AdminInboxItem, 'displayName' | 'profileId'>): string {
  const name = item.displayName?.trim()
  if (name) return name
  return `Khách ${item.profileId.slice(0, 6)}`
}

export function getAdminStatusLabel(identityType: string): string {
  return identityType === 'anonymous' ? 'Khách vãng lai' : 'Đã cập nhật'
}

export function getAdminDeviceLines(detail: AdminSupportDetail | null): string[] {
  if (!detail) return []
  return detail.devices.map((device) => {
    const parts = [device.label, device.platform].filter((value): value is string => Boolean(value))
    return parts.length > 0 ? parts.join(' · ') : 'Thiết bị chưa rõ'
  })
}
