import type { PresentedMessage } from '../message-model'

export function renderFileMessage(message: PresentedMessage): HTMLElement {
  const row = document.createElement('article')
  row.className = `cw-message cw-message--file cw-message--${message.direction}`
  row.dataset.messageId = message.id

  const card = document.createElement('div')
  card.className = 'cw-file-card'

  const name = document.createElement('span')
  name.className = 'cw-file-card__name'
  name.textContent = message.attachment?.name ?? 'Tệp đính kèm'

  const meta = document.createElement('span')
  meta.className = 'cw-file-card__meta'
  meta.textContent = message.attachment?.mimeType ?? ''

  card.append(name, meta)
  row.append(card)
  return row
}
