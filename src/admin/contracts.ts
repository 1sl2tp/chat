export interface AdminInboxItem {
  conversationId: string
  profileId: string
  displayName: string | null
  identityType: string
  address: string | null
  customerLastSeenAt: string | null
  lastMessageAt: string | null
  lastMessageText: string | null
  lastMessageType: string | null
  unreadCount: number
}

export interface AdminDevice {
  id: string
  label: string | null
  platform: string | null
  firstSeenAt: string | null
  lastSeenAt: string | null
  revokedAt: string | null
}

export interface AdminSupportDetail {
  conversationId: string
  profileId: string
  displayName: string | null
  identityType: string
  address: string | null
  customerLastSeenAt: string | null
  devices: AdminDevice[]
}

export interface AdminBackend {
  loadInbox(limit?: number): Promise<AdminInboxItem[]>
  loadDetail(conversationId: string): Promise<AdminSupportDetail>
}

type RecordLike = Record<string, unknown>

function record(value: unknown): RecordLike {
  return value && typeof value === 'object' ? value as RecordLike : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${field}`)
  return value
}

export function decodeAdminInbox(value: unknown): AdminInboxItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const row = record(item)
    return {
      conversationId: requiredText(row.conversation_id, 'conversation_id'),
      profileId: requiredText(row.profile_id, 'profile_id'),
      displayName: text(row.display_name),
      identityType: text(row.identity_type) ?? 'unknown',
      address: text(row.address),
      customerLastSeenAt: text(row.customer_last_seen_at),
      lastMessageAt: text(row.last_message_at),
      lastMessageText: text(row.last_message_text),
      lastMessageType: text(row.last_message_type),
      unreadCount: typeof row.unread_count === 'number' && Number.isFinite(row.unread_count) ? row.unread_count : 0,
    }
  })
}

function decodeDevice(value: unknown): AdminDevice {
  const row = record(value)
  return {
    id: requiredText(row.id, 'device.id'),
    label: text(row.label),
    platform: text(row.platform),
    firstSeenAt: text(row.first_seen_at),
    lastSeenAt: text(row.last_seen_at),
    revokedAt: text(row.revoked_at),
  }
}

export function decodeAdminDetail(value: unknown): AdminSupportDetail {
  const row = record(value)
  return {
    conversationId: requiredText(row.conversation_id, 'conversation_id'),
    profileId: requiredText(row.profile_id, 'profile_id'),
    displayName: text(row.display_name),
    identityType: text(row.identity_type) ?? 'unknown',
    address: text(row.address),
    customerLastSeenAt: text(row.customer_last_seen_at),
    devices: Array.isArray(row.devices) ? row.devices.map(decodeDevice) : [],
  }
}
