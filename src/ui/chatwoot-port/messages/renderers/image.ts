import type { PresentedMessage } from '../message-model'

export function renderImageMessage(message: PresentedMessage): HTMLElement {
  const row = document.createElement('article')
  row.className = `cw-message cw-message--image cw-message--${message.direction}`
  row.dataset.messageId = message.id

  const frame = document.createElement('figure')
  frame.className = 'cw-media cw-media--image'
  if (message.attachment?.width && message.attachment?.height) {
    frame.dataset.aspectRatio = `${message.attachment.width}/${message.attachment.height}`
  }

  const image = document.createElement('img')
  image.className = 'cw-media__image'
  image.src = message.attachment?.url ?? ''
  image.alt = message.attachment?.name ?? 'Ảnh'
  frame.append(image)
  row.append(frame)
  return row
}
