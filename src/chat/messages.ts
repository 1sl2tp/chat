export type LocalMessageStatus = 'sending' | 'sent' | 'failed'

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
  local_status?: LocalMessageStatus
  local_error?: string | null
}

export function getMessageKey(message: ChatMessage): string {
  return message.client_message_id || message.id
}

export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  const clientToId = new Map<string, string>()

  const upsert = (message: ChatMessage) => {
    const clientKey = message.client_message_id
    const previousId = clientKey ? clientToId.get(clientKey) : undefined

    // A server-confirmed message replaces its local optimistic row by client_message_id.
    if (previousId && previousId !== message.id) {
      byId.delete(previousId)
    }

    const existing = byId.get(message.id)
    byId.set(message.id, existing ? { ...existing, ...message } : message)
    if (clientKey) clientToId.set(clientKey, message.id)
  }

  current.forEach(upsert)
  incoming.forEach(upsert)

  return [...byId.values()].sort((a, b) => {
    const byTime = a.created_at.localeCompare(b.created_at)
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id)
  })
}

export function getNewestMessage(messages: ChatMessage[]): ChatMessage | null {
  return messages.length > 0 ? messages[messages.length - 1] : null
}

export function getOldestMessage(messages: ChatMessage[]): ChatMessage | null {
  return messages.length > 0 ? messages[0] : null
}
