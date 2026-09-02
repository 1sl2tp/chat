import type { PresentedMessage } from '../message-model'

export function senderInitials(label?: string): string {
  const parts = (label ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('vi-VN')
  return `${parts[0]![0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toLocaleUpperCase('vi-VN')
}

export function applyIncomingSenderAvatar(row: HTMLElement, message: PresentedMessage): void {
  if (message.direction !== 'incoming') return
  row.dataset.senderInitials = senderInitials(message.senderLabel)
}
