import type { PresentedMessage } from '../message-model'

export function renderCallMessage(message: PresentedMessage): HTMLElement {
  const row = document.createElement('div')
  row.className = 'cw-message cw-message--call cw-message--center'
  row.dataset.messageId = message.id
  if (message.callId) row.dataset.callId = message.callId

  const pill = document.createElement('div')
  pill.className = 'cw-call-activity'
  pill.textContent = message.text ?? 'Cuộc gọi'
  row.append(pill)
  return row
}
