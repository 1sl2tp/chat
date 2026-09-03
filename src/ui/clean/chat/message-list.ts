import type { PresentedMessage } from '../../chatwoot-port/messages/message-model'
import { formatMessageTime } from '../../chatwoot-port/messages/message-time'

export interface CleanMessageListView {
  element: HTMLElement
  update(messages: PresentedMessage[]): void
  destroy(): void
}

function initials(label: string | undefined): string {
  const value = label?.trim() || 'Hỗ trợ'
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || 'HT'
}

function formatBytes(size: number | undefined): string {
  if (!size || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function appendText(body: HTMLElement, text: string): void {
  const paragraph = document.createElement('p')
  paragraph.className = 'clean-message__text'
  paragraph.textContent = text
  body.append(paragraph)
}

function appendImage(body: HTMLElement, message: PresentedMessage): void {
  const attachment = message.attachment
  if (!attachment?.url) return
  const link = document.createElement('a')
  link.className = 'clean-message__image-link'
  link.href = attachment.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'

  const image = document.createElement('img')
  image.className = 'clean-message__image'
  image.src = attachment.url
  image.alt = attachment.name || 'Hình ảnh đính kèm'
  image.loading = 'lazy'
  link.append(image)
  body.append(link)
}

function appendAudio(body: HTMLElement, message: PresentedMessage): void {
  const attachment = message.attachment
  if (!attachment?.url) return

  const card = document.createElement('div')
  card.className = 'clean-message__audio'

  const label = document.createElement('span')
  label.className = 'clean-message__audio-label'
  label.textContent = message.durationSeconds
    ? `Ghi âm · ${Math.round(message.durationSeconds)} giây`
    : 'Ghi âm'

  const audio = document.createElement('audio')
  audio.className = 'clean-message__audio-player'
  audio.controls = true
  audio.preload = 'metadata'
  audio.src = attachment.url

  card.append(label, audio)
  body.append(card)
}

function appendFile(body: HTMLElement, message: PresentedMessage): void {
  const attachment = message.attachment
  if (!attachment?.url) return

  const link = document.createElement('a')
  link.className = 'clean-message__file'
  link.href = attachment.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'

  const icon = document.createElement('span')
  icon.className = 'clean-message__file-icon'
  icon.textContent = '↗'
  icon.setAttribute('aria-hidden', 'true')

  const meta = document.createElement('span')
  meta.className = 'clean-message__file-meta'

  const name = document.createElement('strong')
  name.textContent = attachment.name || 'Tệp đính kèm'
  const size = document.createElement('small')
  size.textContent = formatBytes(attachment.size)

  meta.append(name, size)
  link.append(icon, meta)
  body.append(link)
}

function appendLinkPreview(body: HTMLElement, message: PresentedMessage): void {
  const preview = message.linkPreview
  if (!preview?.url) {
    if (message.text) appendText(body, message.text)
    return
  }

  if (message.text) appendText(body, message.text)

  const link = document.createElement('a')
  link.className = 'clean-message__link-preview'
  link.href = preview.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'

  if (preview.image) {
    const image = document.createElement('img')
    image.src = preview.image
    image.alt = ''
    image.loading = 'lazy'
    link.append(image)
  }

  const content = document.createElement('span')
  content.className = 'clean-message__link-content'

  const site = document.createElement('small')
  site.textContent = preview.siteName || new URL(preview.url, window.location.href).hostname
  const title = document.createElement('strong')
  title.textContent = preview.title || preview.url
  content.append(site, title)

  if (preview.description) {
    const description = document.createElement('span')
    description.textContent = preview.description
    content.append(description)
  }

  link.append(content)
  body.append(link)
}

function createCenterMessage(message: PresentedMessage): HTMLElement {
  const row = document.createElement('div')
  row.className = 'clean-message clean-message--center'
  const pill = document.createElement('div')
  pill.className = 'clean-message__system'
  pill.textContent = message.text || (message.kind === 'call' ? 'Cuộc gọi' : '')
  row.append(pill)
  return row
}

function createMessage(message: PresentedMessage): HTMLElement {
  if (message.direction === 'center') return createCenterMessage(message)

  const row = document.createElement('div')
  row.className = `clean-message clean-message--${message.direction}`
  if (message.groupWithPrevious) row.classList.add('clean-message--grouped-before')
  if (message.groupWithNext) row.classList.add('clean-message--grouped-after')

  if (message.direction === 'incoming') {
    const avatar = document.createElement('div')
    avatar.className = 'clean-message__avatar'
    avatar.textContent = message.groupWithNext ? '' : initials(message.senderLabel)
    avatar.setAttribute('aria-hidden', 'true')
    row.append(avatar)
  }

  const column = document.createElement('div')
  column.className = 'clean-message__column'

  const bubble = document.createElement('div')
  bubble.className = 'clean-message__bubble'

  switch (message.kind) {
    case 'image':
      appendImage(bubble, message)
      if (message.text) appendText(bubble, message.text)
      break
    case 'audio':
      appendAudio(bubble, message)
      break
    case 'file':
      appendFile(bubble, message)
      if (message.text) appendText(bubble, message.text)
      break
    case 'link':
      appendLinkPreview(bubble, message)
      break
    default:
      if (message.text) appendText(bubble, message.text)
      break
  }

  const footer = document.createElement('div')
  footer.className = 'clean-message__footer'
  const time = document.createElement('time')
  time.dateTime = message.createdAt
  time.textContent = formatMessageTime(message.createdAt)
  footer.append(time)

  column.append(bubble, footer)
  row.append(column)
  return row
}

export function createCleanMessageList(host: HTMLElement): CleanMessageListView {
  const element = document.createElement('div')
  element.className = 'clean-message-list'
  host.replaceChildren(element)

  return {
    element,
    update(messages) {
      const fragment = document.createDocumentFragment()
      for (const message of messages) fragment.append(createMessage(message))
      element.replaceChildren(fragment)
    },
    destroy() {
      element.remove()
    },
  }
}
