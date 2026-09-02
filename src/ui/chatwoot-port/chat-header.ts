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

type HeaderActionKind = 'back' | 'menu' | 'call'

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'HT'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('vi-VN')
  return `${parts[0]![0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toLocaleUpperCase('vi-VN')
}

function iconClass(kind: HeaderActionKind): string {
  if (kind === 'back') return 'fa-solid fa-chevron-left text-base'
  if (kind === 'call') return 'fa-solid fa-phone text-xs'
  return 'fa-solid fa-bars text-sm'
}

function applyHeaderIcon(button: HTMLButtonElement, kind: HeaderActionKind, label: string): void {
  button.setAttribute('aria-label', label)
  button.title = label
  const icon = document.createElement('i')
  icon.className = iconClass(kind)
  icon.setAttribute('aria-hidden', 'true')
  button.replaceChildren(icon)
}

function createHeaderButton(
  label: string,
  kind: HeaderActionKind,
  onPress?: () => void,
): HTMLElement {
  if (!onPress) {
    const spacer = document.createElement('span')
    spacer.className = 'cw-chat-header__spacer'
    return spacer
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.className = kind === 'call'
    ? 'cw-chat-header__button cw-chat-header__button--call p-2 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg shrink-0'
    : 'cw-chat-header__button cw-chat-header__button--leading p-1 md:p-2 text-slate-400 hover:text-white rounded-lg shrink-0'
  applyHeaderIcon(button, kind, label)
  button.addEventListener('click', onPress)
  return button
}

function createLeadingAction(onBack?: () => void): HTMLElement {
  if (onBack) return createHeaderButton('Quay lại', 'back', onBack)

  const userMenu = typeof document.querySelector === 'function'
    ? document.querySelector<HTMLButtonElement>('#user-menu')
    : null
  if (!userMenu) return createHeaderButton('Mở menu', 'menu')

  userMenu.className = 'cw-chat-header__button cw-chat-header__button--leading p-1 md:p-2 text-slate-400 hover:text-white rounded-lg shrink-0'
  applyHeaderIcon(userMenu, 'menu', 'Mở menu')
  return userMenu
}

export function createChatHeader(options: ChatHeaderOptions): ChatHeaderView {
  const header = document.createElement('header')
  header.className = 'cw-conversation__header h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-20'

  const row = document.createElement('div')
  row.className = 'cw-chat-header__row flex items-center justify-between w-full min-w-0'

  const left = document.createElement('div')
  left.className = 'cw-chat-header__left flex items-center space-x-3 truncate min-w-0'
  const leading = createLeadingAction(options.onBack)

  const identity = document.createElement('div')
  identity.className = 'cw-chat-header__identity flex items-center space-x-2.5 min-w-0 truncate'

  const avatarWrap = document.createElement('div')
  avatarWrap.className = 'cw-chat-header__avatar-wrap relative shrink-0'
  const avatar = document.createElement('div')
  avatar.className = 'cw-chat-header__avatar w-9 h-9 md:w-8 md:h-8 rounded-full bg-cw-500 font-bold text-white flex items-center justify-center text-xs shadow-md'
  const presence = document.createElement('span')
  presence.className = 'cw-chat-header__presence w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full absolute bottom-0 right-0'
  avatarWrap.append(avatar, presence)

  const copy = document.createElement('div')
  copy.className = 'cw-chat-header__copy min-w-0 truncate'
  const title = document.createElement('h3')
  title.className = 'cw-chat-header__title text-xs font-bold text-white leading-tight truncate'
  const subtitle = document.createElement('p')
  subtitle.className = 'cw-chat-header__subtitle text-[10px] text-emerald-400 font-semibold flex items-center gap-1 truncate'
  const statusDot = document.createElement('span')
  statusDot.className = 'cw-chat-header__status-dot w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0'
  const subtitleText = document.createElement('span')
  subtitleText.className = 'truncate'
  subtitle.append(statusDot, subtitleText)
  copy.append(title, subtitle)

  identity.append(avatarWrap, copy)
  left.append(leading, identity)

  const actions = document.createElement('div')
  actions.className = 'cw-chat-header__actions flex items-center space-x-1 shrink-0'
  const trailing = createHeaderButton('Gọi', 'call', options.onCall)
  actions.append(trailing)

  row.append(left, actions)
  header.append(row)

  const update = (model: ConversationViewModel) => {
    title.textContent = model.title
    subtitleText.textContent = model.subtitle ?? ''
    avatar.textContent = initials(model.title)
    if (options.onCall) trailing.hidden = !model.canCall
  }

  update(options.model)
  return { element: header, update }
}
