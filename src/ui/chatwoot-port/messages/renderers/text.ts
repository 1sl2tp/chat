import type { PresentedMessage } from '../message-model'
import { formatMessageTime } from '../message-time'
import { senderInitials } from './sender-avatar'

function createFooter(message: PresentedMessage): HTMLElement {
  const footer = document.createElement('div')
  footer.className = 'cw-message__footer'
  const time = document.createElement('time')
  time.className = 'cw-message__time'
  time.dateTime = message.createdAt
  time.textContent = formatMessageTime(message.createdAt)
  footer.append(time)
  return footer
}

export function renderTextMessage(message: PresentedMessage): HTMLElement {
  const row = document.createElement('article')
  row.className = `cw-message cw-message--text cw-message--${message.direction}`
  if (message.groupWithPrevious) row.className += ' cw-message--group-previous'
  if (message.groupWithNext) row.className += ' cw-message--group-next'
  row.dataset.messageId = message.id
  const dataSenderInitials = senderInitials(message.senderLabel)
  if (message.direction === 'incoming') row.dataset.senderInitials = dataSenderInitials

  const bubble = document.createElement('div')
  bubble.className = 'cw-message__bubble'

  const content = document.createElement('div')
  content.className = 'cw-message__content'
  content.textContent = message.text ?? ''
  bubble.append(content)

  if (!message.groupWithNext) bubble.append(createFooter(message))

  if (message.reaction === 'heart') {
    const reaction = document.createElement('div')
    reaction.className = 'cw-message__reaction-slot'
    reaction.textContent = '♥'
    bubble.append(reaction)
  }

  row.append(bubble)
  return row
}
