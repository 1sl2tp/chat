import type { AdminInboxItem } from './contracts'
import type { InboxModel, InboxUserRow } from '../ui/chatwoot-port/inbox/inbox'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatInboxTime(value: string | null, now: Date): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((today - day) / 86_400_000)
  if (days <= 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (days === 1) return 'Hôm qua'
  if (days < 7) {
    const weekday = date.getDay()
    return weekday === 0 ? 'CN' : `Th ${weekday + 1}`
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
}

function previewFor(item: AdminInboxItem): string {
  const text = item.lastMessageText?.trim()
  if (text) return text
  if (item.lastMessageType === 'audio') return 'Tin nhắn thoại'
  if (item.lastMessageType === 'image') return 'Hình ảnh'
  if (item.lastMessageType === 'file') return 'Tệp đính kèm'
  if (item.lastMessageType === 'call') return 'Cuộc gọi thoại'
  return 'Chưa có tin nhắn'
}

function toRow(item: AdminInboxItem, now: Date): InboxUserRow {
  return {
    id: item.conversationId,
    kind: item.userLevel === 2 ? 'user2' : 'user1',
    displayName: item.displayName?.trim() || `User ${item.profileId.slice(0, 6)}`,
    username: item.username?.trim() || undefined,
    preview: previewFor(item),
    timestamp: formatInboxTime(item.lastMessageAt, now),
  }
}

export function toInboxModel(items: AdminInboxItem[], now = new Date()): InboxModel {
  const model: InboxModel = { user2: [], user1: [] }
  for (const item of items) {
    const row = toRow(item, now)
    if (row.kind === 'user2') model.user2.push(row)
    else model.user1.push(row)
  }
  return model
}
