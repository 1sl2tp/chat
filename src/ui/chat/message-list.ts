import type { HeartPresentation } from '../../chat/reactions/session'
import type { ChatMessage } from '../../chat/messages'
import { iconSvg } from '../icons'
import { extractHttpUrls } from './linkify'
import { getMessageActionCapabilities } from './message-actions'

export interface MessagePresentation {
  id: string
  text: string
  time: string
  direction: 'incoming' | 'outgoing' | 'system'
  revoked: boolean
}

export interface MessageListOptions {
  resolveAttachmentUrl?: (path: string) => Promise<string>
  getHeart?: (messageId: string) => HeartPresentation
  onHeart?: (messageId: string) => Promise<void> | void
  onOpenImage?: (url: string, name: string) => void
}

export function toMessagePresentation(message: ChatMessage, currentProfileId: string | null): MessagePresentation {
  const revoked = message.revoked_at !== null
  const systemEvent = message.type === 'system' || message.type === 'call'
  const direction = systemEvent
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

function appendLinkedText(container: HTMLElement, text: string): void {
  const urls = extractHttpUrls(text)
  if (urls.length === 0) {
    container.textContent = text
    return
  }

  let cursor = 0
  for (const url of urls) {
    const rawIndex = text.indexOf(url, cursor)
    const index = rawIndex >= 0 ? rawIndex : text.indexOf(url.replace(/\/$/, ''), cursor)
    if (index < 0) continue
    if (index > cursor) container.append(document.createTextNode(text.slice(cursor, index)))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    anchor.textContent = text.slice(index, index + url.replace(/\/$/, '').length)
    container.append(anchor)
    cursor = index + anchor.textContent.length
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)))
}

function addIconButton(parent: HTMLElement, icon: 'heart' | 'copy' | 'share', label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `chat-message__action chat-message__action--${icon}`
  button.innerHTML = iconSvg(icon)
  button.setAttribute('aria-label', label)
  parent.append(button)
  return button
}

async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) return
  await navigator.clipboard.writeText(text)
}

async function shareMessage(message: ChatMessage, options: MessageListOptions): Promise<void> {
  const attachment = message.attachment
  const url = attachment && options.resolveAttachmentUrl
    ? await options.resolveAttachmentUrl(attachment.path)
    : ''
  const text = message.text?.trim() || attachment?.name || 'Tệp đính kèm'

  if (navigator.share) {
    await navigator.share({ title: attachment?.name ?? 'Tin nhắn', text, ...(url ? { url } : {}) })
    return
  }
  await copyText([text, url].filter(Boolean).join('\n'))
}

function renderAttachment(bubble: HTMLElement, message: ChatMessage, options: MessageListOptions): void {
  const attachment = message.attachment
  if (!attachment || message.revoked_at) return

  const host = document.createElement('div')
  host.className = `chat-attachment chat-attachment--${attachment.kind}`
  bubble.append(host)

  if (!options.resolveAttachmentUrl) {
    host.textContent = attachment.name
    return
  }

  if (attachment.kind === 'image') {
    const image = document.createElement('img')
    image.alt = attachment.name
    image.loading = 'lazy'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'chat-attachment__image-button'
    button.setAttribute('aria-label', `Mở ảnh ${attachment.name}`)
    button.append(image)
    host.append(button)
    void options.resolveAttachmentUrl(attachment.path).then((url) => {
      image.src = url
      button.addEventListener('click', () => options.onOpenImage?.(url, attachment.name))
    }).catch(() => {
      host.textContent = 'Không mở được ảnh.'
    })
    return
  }

  if (attachment.kind === 'audio') {
    const audio = document.createElement('audio')
    audio.className = 'chat-attachment__audio-player'
    audio.controls = true
    audio.preload = 'metadata'
    audio.setAttribute('aria-label', attachment.name || 'Tin nhắn thoại')
    host.append(audio)
    void options.resolveAttachmentUrl(attachment.path).then((url) => {
      audio.src = url
    }).catch(() => {
      host.textContent = 'Không phát được ghi âm.'
    })
    return
  }

  const link = document.createElement('a')
  link.className = 'chat-attachment__file'
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.innerHTML = `${iconSvg('file')}<span>${attachment.name}</span>`
  host.append(link)
  void options.resolveAttachmentUrl(attachment.path).then((url) => {
    link.href = url
  }).catch(() => {
    link.removeAttribute('href')
    link.title = 'Không mở được tệp.'
  })
}

function renderReactionSummary(bubble: HTMLElement, message: ChatMessage, options: MessageListOptions): void {
  const presentation = options.getHeart?.(message.id)
  if (!presentation || presentation.count <= 0) return

  const reaction = document.createElement('button')
  reaction.type = 'button'
  reaction.className = 'chat-message__reaction-summary'
  reaction.classList.toggle('is-active', presentation.mine)
  reaction.setAttribute('aria-label', presentation.mine ? 'Bỏ tim' : 'Thả tim')
  reaction.innerHTML = `<span aria-hidden="true">❤️</span><b>${presentation.count}</b>`
  if (options.onHeart) reaction.addEventListener('click', () => void options.onHeart?.(message.id))
  else reaction.disabled = true
  bubble.append(reaction)
}

function renderActions(row: HTMLElement, message: ChatMessage, options: MessageListOptions): void {
  const capabilities = getMessageActionCapabilities(message)
  if (!capabilities.heart && !capabilities.copy && !capabilities.share) return

  const shell = document.createElement('div')
  shell.className = 'chat-message__action-shell'
  shell.dataset.actionsOpen = 'false'

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'chat-message__actions-toggle'
  toggle.innerHTML = iconSvg('more')
  toggle.setAttribute('aria-label', 'Tùy chọn tin nhắn')
  toggle.setAttribute('aria-expanded', 'false')

  const actions = document.createElement('div')
  actions.className = 'chat-message__actions'
  actions.setAttribute('role', 'group')
  actions.setAttribute('aria-label', 'Thao tác tin nhắn')

  const closeMenu = () => {
    shell.dataset.actionsOpen = 'false'
    toggle.setAttribute('aria-expanded', 'false')
  }

  if (capabilities.heart && options.onHeart) {
    const heart = addIconButton(actions, 'heart', 'Thả tim')
    const presentation = options.getHeart?.(message.id) ?? { count: 0, mine: false }
    heart.classList.toggle('is-active', presentation.mine)
    heart.addEventListener('click', () => {
      void options.onHeart?.(message.id)
      closeMenu()
    })
  }

  if (capabilities.copy && message.text) {
    const copy = addIconButton(actions, 'copy', 'Sao chép')
    copy.addEventListener('click', () => {
      void copyText(message.text ?? '')
      closeMenu()
    })
  }

  if (capabilities.share) {
    const share = addIconButton(actions, 'share', 'Chia sẻ')
    share.addEventListener('click', () => {
      void shareMessage(message, options).catch(() => {})
      closeMenu()
    })
  }

  toggle.addEventListener('click', () => {
    const open = shell.dataset.actionsOpen !== 'true'
    shell.dataset.actionsOpen = open ? 'true' : 'false'
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  })

  shell.append(toggle, actions)
  row.append(shell)
}

export function renderMessageList(
  container: HTMLElement,
  messages: ChatMessage[],
  currentProfileId: string | null,
  options: MessageListOptions = {},
): void {
  const fragment = document.createDocumentFragment()

  for (const message of messages) {
    const item = toMessagePresentation(message, currentProfileId)
    const row = document.createElement('article')
    row.className = `chat-message chat-message--${item.direction}${item.revoked ? ' chat-message--revoked' : ''}`
    row.dataset.messageId = item.id

    const bubble = document.createElement('div')
    bubble.className = 'chat-message__bubble'

    if (item.text) {
      const text = document.createElement('div')
      text.className = 'chat-message__text'
      appendLinkedText(text, item.text)
      bubble.append(text)
    }

    renderAttachment(bubble, message, options)

    if (item.time) {
      const time = document.createElement('time')
      time.className = 'chat-message__time'
      time.textContent = item.time
      bubble.append(time)
    }

    renderReactionSummary(bubble, message, options)
    row.append(bubble)
    renderActions(row, message, options)
    fragment.append(row)
  }

  container.replaceChildren(fragment)
}
