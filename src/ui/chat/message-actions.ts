import type { ChatMessage } from '../../chat/messages'

export interface MessageActionCapabilities {
  heart: boolean
  copy: boolean
  share: boolean
  open: boolean
}

export function getMessageActionCapabilities(message: ChatMessage): MessageActionCapabilities {
  if (message.revoked_at || message.type === 'system' || message.type === 'call') {
    return { heart: false, copy: false, share: false, open: false }
  }

  const hasText = Boolean(message.text?.trim())
  const hasAttachment = Boolean(message.attachment)
  const textMessage = message.type === 'text' && !hasAttachment

  return {
    heart: textMessage,
    copy: textMessage && hasText,
    share: (textMessage && hasText) || hasAttachment,
    open: hasAttachment,
  }
}

export function nextHeartReaction(currentEmoji: string | null | undefined): '❤️' | null {
  return currentEmoji === '❤️' ? null : '❤️'
}
