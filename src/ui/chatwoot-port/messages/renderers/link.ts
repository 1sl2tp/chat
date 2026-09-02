import type { PresentedMessage } from '../message-model'

export function renderLinkMessage(message: PresentedMessage): HTMLElement {
  const row = document.createElement('article')
  row.className = `cw-message cw-message--link cw-message--${message.direction}`
  row.dataset.messageId = message.id

  const card = document.createElement('div')
  card.className = 'cw-link-card'

  const url = document.createElement('span')
  url.className = 'cw-link-card__url'
  url.textContent = message.text ?? ''

  card.append(url)
  row.append(card)
  return row
}
