import { getChatMessageState, subscribeChatMessages } from '../../chat/message-runtime'
import type { ChatMessage } from '../../chat/messages'
import { clearAdminSelection, refreshAdminInbox, selectAdminConversation, sendAdminText } from '../../admin/runtime'
import { getAdminState, subscribeAdminState } from '../../admin/store'
import { formatVersionLabel } from '../../version'
import { mountComposer } from '../chat/composer'
import { getAdminCustomerLabel, getAdminDeviceLines, getAdminEmptyMessage, getAdminStatusLabel } from './view-model'
import './style.css'

function renderAdminMessages(container: HTMLElement, messages: ChatMessage[], customerProfileId: string | null): void {
  const fragment = document.createDocumentFragment()
  for (const message of messages) {
    const row = document.createElement('article')
    const direction = message.type === 'system' ? 'system' : message.sender_id === customerProfileId ? 'incoming' : 'outgoing'
    row.className = `chat-message chat-message--${direction}`

    const bubble = document.createElement('div')
    bubble.className = 'chat-message__bubble'
    const text = document.createElement('div')
    text.className = 'chat-message__text'
    text.textContent = message.revoked_at ? 'Tin nhắn đã được thu hồi' : message.text ?? ''
    bubble.append(text)
    row.append(bubble)
    fragment.append(row)
  }
  container.replaceChildren(fragment)
}

function formatTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toUpperCase()
}

export function mountAdminScreen(root: HTMLElement): () => void {
  const screen = document.createElement('main')
  screen.className = 'admin-screen'

  const appRail = document.createElement('aside')
  appRail.className = 'admin-rail'

  const brand = document.createElement('div')
  brand.className = 'admin-rail__brand'
  const brandMark = document.createElement('div')
  brandMark.className = 'admin-rail__brand-mark'
  brandMark.textContent = 'C'
  const brandLabel = document.createElement('span')
  brandLabel.textContent = 'Chat'
  brand.append(brandMark, brandLabel)

  const railNav = document.createElement('nav')
  railNav.className = 'admin-rail__nav'
  railNav.setAttribute('aria-label', 'Điều hướng Admin')
  const supportNav = document.createElement('button')
  supportNav.type = 'button'
  supportNav.className = 'admin-rail__item'
  supportNav.dataset.active = 'true'
  supportNav.innerHTML = '<span aria-hidden="true">◫</span><small>Hỗ trợ</small>'
  railNav.append(supportNav)

  const railAccount = document.createElement('div')
  railAccount.className = 'admin-rail__account'
  railAccount.innerHTML = '<span class="admin-rail__status" aria-hidden="true"></span><strong>AD</strong><small>Admin</small>'
  appRail.append(brand, railNav, railAccount)

  const inboxPane = document.createElement('section')
  inboxPane.className = 'admin-inbox'
  const inboxHeader = document.createElement('header')
  inboxHeader.className = 'admin-inbox__header'
  const inboxHeading = document.createElement('div')
  inboxHeading.className = 'admin-inbox__heading'
  const inboxTitle = document.createElement('h1')
  inboxTitle.textContent = 'Hỗ trợ'
  const inboxSubtitle = document.createElement('p')
  inboxSubtitle.textContent = 'User ↔ Admin'
  inboxHeading.append(inboxTitle, inboxSubtitle)
  const refresh = document.createElement('button')
  refresh.type = 'button'
  refresh.className = 'admin-icon-button'
  refresh.textContent = '↻'
  refresh.setAttribute('aria-label', 'Làm mới')
  refresh.addEventListener('click', () => void refreshAdminInbox())
  inboxHeader.append(inboxHeading, refresh)
  const inboxList = document.createElement('div')
  inboxList.className = 'admin-inbox__list'
  inboxPane.append(inboxHeader, inboxList)

  const conversationPane = document.createElement('section')
  conversationPane.className = 'admin-conversation'
  const conversationHeader = document.createElement('header')
  conversationHeader.className = 'admin-conversation__header'
  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'admin-back admin-icon-button'
  back.textContent = '‹'
  back.setAttribute('aria-label', 'Quay lại')
  back.addEventListener('click', clearAdminSelection)
  const conversationAvatar = document.createElement('div')
  conversationAvatar.className = 'admin-conversation__avatar'
  conversationAvatar.textContent = 'U'
  const customer = document.createElement('div')
  customer.className = 'admin-customer'
  const customerName = document.createElement('h2')
  const customerMeta = document.createElement('p')
  customer.append(customerName, customerMeta)
  conversationHeader.append(back, conversationAvatar, customer)

  const detail = document.createElement('aside')
  detail.className = 'admin-detail'
  const messages = document.createElement('div')
  messages.className = 'admin-messages'
  const composerHost = document.createElement('div')
  composerHost.className = 'admin-composer chat-composer'
  const version = document.createElement('div')
  version.className = 'admin-version'
  version.textContent = formatVersionLabel(import.meta.env.VITE_BUILD_ID ?? 'dev')
  conversationPane.append(conversationHeader, detail, messages, composerHost, version)

  screen.append(appRail, inboxPane, conversationPane)
  root.replaceChildren(screen)

  const composer = mountComposer(composerHost, sendAdminText)

  const render = () => {
    const state = getAdminState()
    const messageState = getChatMessageState()
    screen.dataset.selected = state.selectedConversationId ? 'true' : 'false'
    composer.setEnabled(Boolean(state.selectedConversationId) && messageState.realtime !== 'error')

    const listFragment = document.createDocumentFragment()
    for (const item of state.inbox) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'admin-inbox__item'
      if (item.conversationId === state.selectedConversationId) button.dataset.active = 'true'

      const avatar = document.createElement('span')
      avatar.className = 'admin-inbox__avatar'
      const label = getAdminCustomerLabel(item)
      avatar.textContent = initials(label)

      const content = document.createElement('span')
      content.className = 'admin-inbox__content'
      const top = document.createElement('span')
      top.className = 'admin-inbox__item-top'
      const name = document.createElement('strong')
      name.textContent = label
      const time = document.createElement('time')
      time.textContent = formatTime(item.lastMessageAt)
      top.append(name, time)

      const bottom = document.createElement('span')
      bottom.className = 'admin-inbox__item-bottom'
      const preview = document.createElement('span')
      preview.textContent = item.lastMessageText ?? 'Chưa có tin nhắn'
      bottom.append(preview)
      if (item.unreadCount > 0) {
        const unread = document.createElement('b')
        unread.className = 'admin-unread'
        unread.textContent = String(item.unreadCount)
        bottom.append(unread)
      }
      content.append(top, bottom)
      button.append(avatar, content)
      button.addEventListener('click', () => void selectAdminConversation(item.conversationId))
      listFragment.append(button)
    }
    inboxList.replaceChildren(listFragment)

    const selected = state.inbox.find((item) => item.conversationId === state.selectedConversationId)
    const selectedLabel = state.detail?.displayName?.trim() || (selected ? getAdminCustomerLabel(selected) : 'Chọn khách')
    customerName.textContent = selectedLabel
    conversationAvatar.textContent = initials(selectedLabel)
    customerMeta.textContent = state.detail ? getAdminStatusLabel(state.detail.identityType) : 'Chọn một hội thoại để bắt đầu'

    if (state.detail) {
      const fields: string[] = []
      if (state.detail.address) fields.push(`Địa chỉ: ${state.detail.address}`)
      fields.push(...getAdminDeviceLines(state.detail).map((line) => `Thiết bị: ${line}`))
      if (state.detail.customerLastSeenAt) fields.push(`Hoạt động: ${new Date(state.detail.customerLastSeenAt).toLocaleString('vi-VN')}`)
      detail.replaceChildren(...fields.map((value) => {
        const p = document.createElement('p')
        p.textContent = value
        return p
      }))
    } else {
      detail.replaceChildren()
    }

    if (state.selectedConversationId) {
      renderAdminMessages(messages, messageState.messages, state.detail?.profileId ?? null)
    } else {
      const empty = document.createElement('div')
      empty.className = 'chat-empty'
      empty.textContent = getAdminEmptyMessage(state.phase, state.error)
      messages.replaceChildren(empty)
    }
  }

  const stopAdmin = subscribeAdminState(render)
  const stopMessages = subscribeChatMessages(render)
  const onFocus = () => void refreshAdminInbox()
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onFocus)
  render()

  return () => {
    stopAdmin()
    stopMessages()
    composer.destroy()
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onFocus)
  }
}
