import type { ChatAttachment } from './attachments/types'

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_id: string
  client_message_id: string
  type: string
  text: string | null
  reply_to_id: string | null
  created_at: string
  edited_at: string | null
  revoked_at: string | null
  call_id: string | null
  attachment: ChatAttachment | null
}

export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
}
