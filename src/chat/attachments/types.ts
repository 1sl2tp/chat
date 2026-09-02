export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export type ChatAttachmentKind = 'image' | 'audio' | 'file'

export interface ChatAttachment {
  kind: ChatAttachmentKind
  path: string
  name: string
  mime: string
  size: number
  duration_ms?: number
  width?: number
  height?: number
}

export function attachmentKindForMime(mime: string): ChatAttachmentKind {
  if (mime.toLowerCase().startsWith('image/')) return 'image'
  if (mime.toLowerCase().startsWith('audio/')) return 'audio'
  return 'file'
}

export function sanitizeAttachmentName(name: string): string {
  const replaced = name.trim().replace(/[\\/]+/g, '_').replace(/^\.+_*/, '')
  const safe = replaced.replace(/[\u0000-\u001f<>:"|?*]+/g, '_').slice(0, 120)
  return safe || 'file'
}

export function validateAttachmentFile(file: Pick<File, 'size' | 'name'>): void {
  if (file.size <= 0) throw new Error('attachment_empty')
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('attachment_too_large')
  if (!sanitizeAttachmentName(file.name)) throw new Error('attachment_name_invalid')
}
