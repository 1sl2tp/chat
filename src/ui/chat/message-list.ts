import { getMessageKey, type ChatMessage } from '../../chat/messages'

export interface MessagePresentation {
  id: string
  key: string
  text: string
  time: string
  direction: 'incoming' | 'outgoing' | 'system'
  revoked: boolean
  status: 'sending' | 'sent' | 'failed'
}

export interface MessageListRenderResult {
  initial: boolean
  addedCount: number
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
    key: getMessageKey(message),
    text: revoked ? 'Tin nhắn đã được thu hồi' : message.text ?? '',
    time,
    direction,
    revoked,
    status: message.local_status ?? 'sent',
  }
}

function getOrCreatePart<T extends HTMLElement>(
  parent: HTMLElement,
  selector: string,
  create: () => T,
): T {
  const found = parent.querySelector<T>(selector)
  if (found) return found
  const element = create()
  parent.append(element)
  return element
}

function updateMessageRow(
  row: HTMLElement,
  message: ChatMessage,
  currentProfileId: string | null,
): void {
  const item = toMessagePresentation(message, currentProfileId)
  row.className = `chat-message chat-message--${item.direction}${item.revoked ? ' chat-message--revoked' : ''}${item.status === 'failed' ? ' chat-message--failed' : ''}`
  row.dataset.messageId = item.id
  row.dataset.messageKey = item.key

  const bubble = getOrCreatePart(row, '.chat-message__bubble', () => {
    const element = document.createElement('div')
    element.className = 'chat-message__bubble'
    return element
  })

  const text = getOrCreatePart(bubble, '.chat-message__text', () => {
    const element = document.createElement('div')
    element.className = 'chat-message__text'
    return element
  })
  if (text.textContent !== item.text) text.textContent = item.text

  let meta = bubble.querySelector<HTMLElement>('.chat-message__meta')
  if (!meta) {
    meta = document.createElement('div')
    meta.className = 'chat-message__meta'
    bubble.append(meta)
  }

  let time = meta.querySelector<HTMLTimeElement>('.chat-message__time')
  if (item.time) {
    if (!time) {
      time = document.createElement('time')
      time.className = 'chat-message__time'
      meta.append(time)
    }
    if (time.textContent !== item.time) time.textContent = item.time
  } else {
    time?.remove()
  }

  let status = meta.querySelector<HTMLElement>('.chat-message__status')
  if (item.status !== 'sent') {
    if (!status) {
      status = document.createElement('span')
      status.className = 'chat-message__status'
      meta.append(status)
    }
    status.textContent = item.status === 'sending' ? 'Đang gửi…' : 'Gửi lỗi'
  } else {
    status?.remove()
  }
}

export function renderMessageList(
  container: HTMLElement,
  messages: ChatMessage[],
  currentProfileId: string | null,
): MessageListRenderResult {
  const existing = new Map<string, HTMLElement>()
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue
    const key = child.dataset.messageKey
    if (key) existing.set(key, child)
  }

  const initial = existing.size === 0
  const desiredKeys = new Set<string>()
  let addedCount = 0

  messages.forEach((message, index) => {
    const key = getMessageKey(message)
    desiredKeys.add(key)

    let row = existing.get(key)
    if (!row) {
      row = document.createElement('article')
      addedCount += 1
    }

    updateMessageRow(row, message, currentProfileId)

    const currentAtIndex = container.children[index]
    if (currentAtIndex !== row) {
      container.insertBefore(row, currentAtIndex ?? null)
    }
  })

  for (const [key, row] of existing) {
    if (!desiredKeys.has(key)) row.remove()
  }

  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLElement && !child.dataset.messageKey) child.remove()
  }

  return { initial, addedCount }
}
