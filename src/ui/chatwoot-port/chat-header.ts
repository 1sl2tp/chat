import { setButtonIcon, type AppIconName } from '../icons'
import type { ConversationViewModel } from './contracts'

export interface ChatHeaderOptions {
  model: ConversationViewModel
  onBack?: () => void
  onCall?: () => void
}

export interface ChatHeaderView {
  element: HTMLElement
  update(model: ConversationViewModel): void
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'HT'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('vi-VN')
  return `${parts[0]![0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toLocaleUpperCase('vi-VN')
}

function createHeaderButton(label: string, icon: AppIconName, onPress?: () => void): HTMLElement {
  if (!onPress) {
    const spacer = document.createElement('span')
    spacer.className = 'cw-chat-header__spacer'
    return spacer
  }

  const button = document.createElement('button')
  button.className = 'cw-chat-header__button'
  button.type = 'button'
  setButtonIcon(button, icon, label)
  button.addEventListener('click', onPress)
  return button
}

function createLeadingAction(onBack?: () => void): HTMLElement {
  if (onBack) return createHeaderButton('Quay lại', 'back', onBack)

  const userMenu = typeof document.querySelector === 'function'
    ? document.querySelector<HTMLButtonElement>('#user-menu')
    : null
  if (!userMenu) return createHeaderButton('Mở menu', 'menu')

  userMenu.className = 'cw-chat-header__button'
  setButtonIcon(userMenu, 'menu', 'Mở menu')
  return userMenu
}

export function createChatHeader(options: ChatHeaderOptions): ChatHeaderView {
  const header = document.createElement('header')
  header.className = 'cw-conversation__header'

  const row = document.createElement('div')
  row.className = 'cw-chat-header__row'

  const leading = createLeadingAction(options.onBack)

  const identity = document.createElement('div')
  identity.className = 'cw-chat-header__identity'

  const avatarWrap = document.createElement('div')
  avatarWrap.className = 'cw-chat-header__avatar-wrap'
  const avatar = document.createElement('div')
  avatar.className = 'cw-chat-header__avatar'
  const presence = document.createElement('span')
  presence.className = 'cw-chat-header__presence'
  presence.setAttribute('aria-label', 'Đang hoạt động')
  avatarWrap.append(avatar, presence)

  const copy = document.createElement('div')
  copy.className = 'cw-chat-header__copy'
  const title = document.createElement('div')
  title.className = 'cw-chat-header__title'
  const subtitle = document.createElement('div')
  subtitle.className = 'cw-chat-header__subtitle'
  copy.append(title, subtitle)

  identity.append(avatarWrap, copy)
  const trailing = createHeaderButton('Gọi', 'call', options.onCall)
  row.append(leading, identity, trailing)
  header.append(row)

  const update = (model: ConversationViewModel) => {
    title.textContent = model.title
    subtitle.textContent = model.subtitle ?? ''
    avatar.textContent = initials(model.title)
    if (options.onCall) trailing.hidden = !model.canCall
  }

  update(options.model)
  return { element: header, update }
}
