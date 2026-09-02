import type { HeartPresentation } from '../../chat/reactions/session'
import type { ChatMessage } from '../../chat/messages'
import { iconSvg } from '../icons'
import type { LinkPreviewMetadata, LinkPreviewResolver } from './link-preview'
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
  resolveLinkPreview?: LinkPreviewResolver
  getHeart?: (messageId: string) => HeartPresentation
  onHeart?: (messageId: string) => Promise<void> | void
  onOpenImage?: (url: string, name: string) => void
}

const COMPACT_CALL_TEXT = /^(?:Cuộc gọi đã hủy|Đã từ chối|Cuộc gọi đã kết thúc)$/i

function compactCallLabel(text: string): string {
  const normalized = text.trim()
  if (/^Đã từ chối$/i.test(normalized)) return 'cuộc gọi bị từ chối'
  return normalized.charAt(0).toLocaleLowerCase('vi-VN') + normalized.slice(1)
}

export function compactCallEventMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  let index = 0

  while (index < messages.length) {
    const current = messages[index]!
    const text = current.text?.trim() ?? ''
    if (current.type !== 'call' || !COMPACT_CALL_TEXT.test(text)) {
      result.push(current)
      index += 1
      continue
    }

    let end = index + 1
    while (end < messages.length) {
      const next = messages[end]!
      if (next.type !== 'call' || (next.text?.trim() ?? '').toLocaleLowerCase('vi-VN') !== text.toLocaleLowerCase('vi-VN')) break
      end += 1
    }

    const count = end - index
    if (count === 1) {
      result.push(current)
    } else {
      const last = messages[end - 1]!
      result.push({
        ...last,
        id: `call-group:${current.id}:${last.id}`,
        client_message_id: `call-group:${current.client_message_id}:${last.client_message_id}`,
        text: `📞 ${count} ${compactCallLabel(text)}`,
      })
    }
    index = end
  }

  return result
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

function previewTitle(url: URL): string {
  const segment = url.pathname.split('/').filter(Boolean).at(-1) ?? ''
  if (!segment) return 'Mở liên kết'
  try {
    const decoded = decodeURIComponent(segment).replace(/[-_]+/g, ' ').trim()
    return decoded.length > 64 ? `${decoded.slice(0, 61)}…` : decoded || 'Mở liên kết'
  } catch {
    return 'Mở liên kết'
  }
}

function validHttpUrl(value: string): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

function applyLinkPreviewMetadata(
  card: HTMLAnchorElement,
  mark: HTMLElement,
  domain: HTMLElement,
  title: HTMLElement,
  description: HTMLElement,
  metadata: LinkPreviewMetadata,
): void {
  const resolvedUrl = validHttpUrl(metadata.url)
  if (resolvedUrl) card.href = resolvedUrl

  let hostname = ''
  try {
    hostname = new URL(card.href).hostname.replace(/^www\./, '')
  } catch {
    hostname = ''
  }
  domain.textContent = metadata.siteName || hostname
  title.textContent = metadata.title || title.textContent || 'Mở liên kết'
  description.textContent = metadata.description || resolvedUrl || description.textContent || ''

  const imageUrl = validHttpUrl(metadata.image)
  if (!imageUrl || card.querySelector('.chat-link-preview__image')) return
  const image = document.createElement('img')
  image.className = 'chat-link-preview__image'
  image.loading = 'lazy'
  image.decoding = 'async'
  image.referrerPolicy = 'no-referrer'
  image.alt = ''
  image.src = imageUrl
  image.addEventListener('error', () => {
    if (image.isConnected) image.replaceWith(mark)
  }, { once: true })
  mark.replaceWith(image)
}

function renderLinkPreview(bubble: HTMLElement, text: string, options: MessageListOptions): void {
  const urlText = extractHttpUrls(text)[0]
  if (!urlText) return
  let url: URL
  try {
    url = new URL(urlText)
  } catch {
    return
  }

  const card = document.createElement('a')
  card.className = 'chat-link-preview'
  card.href = url.href
  card.target = '_blank'
  card.rel = 'noopener noreferrer'
  card.setAttribute('aria-label', `Mở liên kết ${url.hostname}`)

  const mark = document.createElement('span')
  mark.className = 'chat-link-preview__mark'
  mark.textContent = url.hostname.replace(/^www\./, '').slice(0, 1).toLocaleUpperCase('vi-VN') || '↗'

  const body = document.createElement('span')
  body.className = 'chat-link-preview__body'
  const domain = document.createElement('strong')
  domain.textContent = url.hostname.replace(/^www\./, '')
  const title = document.createElement('span')
  title.className = 'chat-link-preview__title'
  title.textContent = previewTitle(url)
  const description = document.createElement('small')
  description.className = 'chat-link-preview__description'
  description.textContent = url.href.length > 120 ? `${url.href.slice(0, 117)}…` : url.href
  body.append(domain, title, description)
  card.append(mark, body)
  bubble.append(card)

  if (options.resolveLinkPreview) {
    void options.resolveLinkPreview(url.href).then((metadata) => {
      if (!metadata) return
      applyLinkPreviewMetadata(card, mark, domain, title, description, metadata)
    }).catch(() => {})
  }
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

async function shareResolvedUrl(url: string, name: string): Promise<void> {
  if (navigator.share) {
    await navigator.share({ title: name, url })
    return
  }
  await copyText(url)
}

async function shareMessage(message: ChatMessage): Promise<void> {
  const text = message.text?.trim() ?? ''
  if (!text) return
  if (navigator.share) {
    await navigator.share({ text })
    return
  }
  await copyText(text)
}

function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function createMediaTools(name: string): {
  host: HTMLElement
  save: HTMLAnchorElement
  share: HTMLButtonElement
} {
  const host = document.createElement('div')
  host.className = 'chat-attachment__tools'

  const save = document.createElement('a')
  save.className = 'chat-attachment__tool chat-attachment__tool--save'
  save.textContent = 'Lưu'
  save.download = name
  save.setAttribute('aria-label', `Lưu ${name}`)

  const share = document.createElement('button')
  share.type = 'button'
  share.className = 'chat-attachment__tool chat-attachment__tool--share'
  share.textContent = 'Chia sẻ'
  share.setAttribute('aria-label', `Chia sẻ ${name}`)

  host.append(save, share)
  return { host, save, share }
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
    audio.preload = 'metadata'
    audio.hidden = true

    const player = document.createElement('div')
    player.className = 'chat-audio-player'
    const play = document.createElement('button')
    play.type = 'button'
    play.className = 'chat-audio-player__play'
    play.textContent = '▶'
    play.setAttribute('aria-label', 'Phát ghi âm')

    const range = document.createElement('input')
    range.type = 'range'
    range.className = 'chat-audio-player__range'
    range.min = '0'
    range.max = '1000'
    range.value = '0'
    range.step = '1'
    range.setAttribute('aria-label', 'Vị trí phát ghi âm')

    const time = document.createElement('span')
    time.className = 'chat-audio-player__time'
    time.textContent = '0:00'

    const tools = createMediaTools(attachment.name || 'ghi-am.webm')
    player.append(play, range, time)
    host.append(player, tools.host, audio)

    const sync = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
      range.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0'
      time.textContent = duration > 0
        ? `${formatMediaTime(current)} / ${formatMediaTime(duration)}`
        : formatMediaTime(current)
      play.textContent = audio.paused ? '▶' : '❚❚'
      play.setAttribute('aria-label', audio.paused ? 'Phát ghi âm' : 'Tạm dừng ghi âm')
    }

    play.addEventListener('click', () => {
      if (audio.paused) void audio.play().catch(() => {})
      else audio.pause()
    })
    range.addEventListener('input', () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return
      audio.currentTime = (Number(range.value) / 1000) * audio.duration
      sync()
    })
    audio.addEventListener('loadedmetadata', sync)
    audio.addEventListener('timeupdate', sync)
    audio.addEventListener('play', sync)
    audio.addEventListener('pause', sync)
    audio.addEventListener('ended', sync)

    void options.resolveAttachmentUrl(attachment.path).then((url) => {
      audio.src = url
      tools.save.href = url
      tools.share.addEventListener('click', () => void shareResolvedUrl(url, attachment.name || 'Ghi âm').catch(() => {}))
    }).catch(() => {
      host.textContent = 'Không phát được ghi âm.'
    })
    return
  }

  const card = document.createElement('a')
  card.className = 'chat-attachment__file'
  card.target = '_blank'
  card.rel = 'noopener noreferrer'
  card.innerHTML = `${iconSvg('file')}<span>${attachment.name}</span>`
  const tools = createMediaTools(attachment.name)
  host.append(card, tools.host)

  void options.resolveAttachmentUrl(attachment.path).then((url) => {
    card.href = url
    tools.save.href = url
    tools.share.addEventListener('click', () => void shareResolvedUrl(url, attachment.name).catch(() => {}))
  }).catch(() => {
    card.removeAttribute('href')
    tools.save.removeAttribute('href')
    card.title = 'Không mở được tệp.'
  })
}

function renderReactionSummary(bubble: HTMLElement, message: ChatMessage, options: MessageListOptions): void {
  if (!getMessageActionCapabilities(message).heart) return
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

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('a,button,audio,input,textarea,select'))
}

function attachHeartGesture(bubble: HTMLElement, message: ChatMessage, options: MessageListOptions): void {
  if (!options.onHeart || !getMessageActionCapabilities(message).heart) return
  let lastTapAt = 0
  let pointerHeartAt = 0

  bubble.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse' || isInteractiveTarget(event.target)) return
    const now = Date.now()
    if (now - lastTapAt > 320) {
      lastTapAt = now
      return
    }
    lastTapAt = 0
    pointerHeartAt = now
    void options.onHeart?.(message.id)
  })

  bubble.addEventListener('dblclick', (event) => {
    if (isInteractiveTarget(event.target) || Date.now() - pointerHeartAt < 500) return
    void options.onHeart?.(message.id)
  })
}

function renderActions(row: HTMLElement, bubble: HTMLElement, message: ChatMessage, options: MessageListOptions): void {
  if (message.attachment) return
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

  const setOpen = (open: boolean) => {
    shell.dataset.actionsOpen = open ? 'true' : 'false'
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  }
  const closeMenu = () => setOpen(false)

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

  if (capabilities.share && message.text) {
    const share = addIconButton(actions, 'share', 'Chia sẻ')
    share.addEventListener('click', () => {
      void shareMessage(message).catch(() => {})
      closeMenu()
    })
  }

  toggle.addEventListener('click', () => setOpen(shell.dataset.actionsOpen !== 'true'))
  bubble.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    setOpen(true)
  })

  let longPressTimer = 0
  const cancelLongPress = () => {
    if (!longPressTimer) return
    window.clearTimeout(longPressTimer)
    longPressTimer = 0
  }
  bubble.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || isInteractiveTarget(event.target)) return
    cancelLongPress()
    longPressTimer = window.setTimeout(() => {
      longPressTimer = 0
      setOpen(true)
    }, 450)
  })
  bubble.addEventListener('pointerup', cancelLongPress)
  bubble.addEventListener('pointercancel', cancelLongPress)
  bubble.addEventListener('pointermove', cancelLongPress)

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

  for (const message of compactCallEventMessages(messages)) {
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
      if (item.direction !== 'system' && !item.revoked) renderLinkPreview(bubble, item.text, options)
    }

    renderAttachment(bubble, message, options)

    if (item.time) {
      const time = document.createElement('time')
      time.className = 'chat-message__time'
      time.textContent = item.time
      bubble.append(time)
    }

    renderReactionSummary(bubble, message, options)
    attachHeartGesture(bubble, message, options)
    row.append(bubble)
    renderActions(row, bubble, message, options)
    fragment.append(row)
  }

  container.replaceChildren(fragment)
}
