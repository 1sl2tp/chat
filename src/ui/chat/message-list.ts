import type { ChatMessage } from '../../chat/messages'

export interface MessagePresentation {
  id: string
  text: string
  time: string
  direction: 'incoming' | 'outgoing' | 'system'
  revoked: boolean
}

export function toMessagePresentation(message: ChatMessage, currentProfileId: string | null): MessagePresentation {
  const revoked = message.revoked_at !== null
  const direction = message.type === 'system'
    ? 'system'
    : currentProfileId !== null && message.sender_id === currentProfileId
      ? 'outgoing'
      : 'incoming'

  const date = new Date(message.created_at)
  const time = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date)

  return {
    id: message.id,
    text: revoked ? 'Tin nhắn đã được thu hồi' : message.text ?? '',
    time,
    direction,
    revoked,
  }
}

export function renderMessageList(container: HTMLElement, messages: ChatMessage[], currentProfileId: string | null): void {
  const fragment = document.createDocumentFragment()

  for (const message of messages) {
    const item = toMessagePresentation(message, currentProfileId)
    const row = document.createElement('article')
    row.className = `chat-message chat-message--${item.direction}${item.revoked ? ' chat-message--revoked' : ''}`
    row.dataset.messageId = item.id

    const bubble = document.createElement('div')
    bubble.className = 'chat-message__bubble'

    const text = document.createElement('div')
    text.className = 'chat-message__text'
    text.textContent = item.text
    bubble.append(text)

    if (item.time) {
      const time = document.createElement('time')
      time.className = 'chat-message__time'
      time.textContent = item.time
      bubble.append(time)
    }

    row.append(bubble)
    fragment.append(row)
  }

  container.replaceChildren(fragment)
}
