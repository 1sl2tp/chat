import type { ChatMessage } from '../../chat/messages'
import type { ChatReactionSession } from '../../chat/reactions/session'

export interface ConversationCapabilities {
  sendAttachment(file: File): Promise<ChatMessage>
  resolveAttachmentUrl(path: string): Promise<string>
  reactionSession: ChatReactionSession
}

let current: { token: symbol; value: ConversationCapabilities } | null = null

export function setConversationCapabilities(value: ConversationCapabilities): symbol {
  const token = Symbol('conversation-capabilities')
  current = { token, value }
  return token
}

export function getConversationCapabilities(): ConversationCapabilities | null {
  return current?.value ?? null
}

export function clearConversationCapabilities(token: symbol): void {
  if (current?.token === token) current = null
}
