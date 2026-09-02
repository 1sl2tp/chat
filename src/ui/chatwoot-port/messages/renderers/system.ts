import type { PresentedMessage } from '../message-model'

export function renderSystemMessage(message: PresentedMessage): HTMLElement {
  const row = document.createElement('div')
  row.className = 'cw-message cw-message--system cw-message--center'
  row.dataset.messageId = message.id

  const pill = document.createElement('div')
  pill.className = 'cw-activity'
  pill.textContent = message.text ?? ''
  row.append(pill)
  return row
}
