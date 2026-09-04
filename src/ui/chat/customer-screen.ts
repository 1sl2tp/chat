import { getChatMessageState, subscribeChatMessages } from '../../chat/message-runtime'
import { loadOlderSupportMessages, sendSupportText } from '../../chat/runtime'
import { getChatRuntimeState, subscribeChatRuntime } from '../../chat/store'
import { formatVersionLabel } from '../../version'
import { mountComposer } from './composer'
import { renderMessageList } from './message-list'
import { mountOverflowMenu } from './overflow-menu'
import { mountProfileForm } from './profile-form'
import { createConversationScrollController } from './scroll-controller'
import { buildCustomerChatViewModel } from './view-model'

function currentDisplayName(): string | null {
  const identity = getChatRuntimeState().identity
  if (!identity || typeof identity !== 'object') return null
  const value = (identity as { display_name?: unknown }).display_name
  return typeof value === 'string' ? value : null
}

export function mountCustomerChatScreen(root: HTMLElement): () => void {
  const screen = document.createElement('main')
  screen.className = 'chat-screen'

  const header = document.createElement('header')
  header.className = 'chat-header'

  const avatar = document.createElement('div')
  avatar.className = 'chat-header__avatar'
  avatar.textContent = 'A'
  avatar.setAttribute('aria-hidden', 'true')

  const identity = document.createElement('div')
  identity.className = 'chat-header__identity'
  const title = document.createElement('h1')
  title.textContent = 'Admin hỗ trợ'
  const status = document.createElement('p')
  status.textContent = 'Đang chuẩn bị'
  identity.append(title, status)

  const actions = document.createElement('div')
  actions.className = 'chat-header__actions'
  const menuButton = document.createElement('button')
  menuButton.type = 'button'
  menuButton.className = 'chat-header__menu-button'
  menuButton.textContent = '•••'
  menuButton.setAttribute('aria-label', 'Tùy chọn')
  actions.append(menuButton)
  header.append(avatar, identity, actions)

  const messages = document.createElement('section')
  messages.className = 'chat-messages'
  messages.setAttribute('aria-label', 'Tin nhắn với Admin')
  const empty = document.createElement('div')
  empty.className = 'chat-empty'
  empty.textContent = 'Bạn cần hỗ trợ gì?'
  messages.append(empty)

  const newMessages = document.createElement('button')
  newMessages.type = 'button'
  newMessages.className = 'chat-new-messages'
  newMessages.hidden = true

  const footer = document.createElement('footer')
  footer.className = 'chat-footer'
  const composer = document.createElement('div')
  composer.className = 'chat-composer'
  const version = document.createElement('div')
  version.className = 'chat-version'
  version.textContent = formatVersionLabel(import.meta.env.VITE_BUILD_ID ?? 'dev')
  footer.append(composer, version)

  screen.append(header, messages, footer, newMessages)
  root.replaceChildren(screen)

  const profileForm = mountProfileForm(screen)
  const menu = mountOverflowMenu(actions, {
    onEditProfile: () => profileForm.open(currentDisplayName()),
  })
  menuButton.addEventListener('click', () => menu.toggle())
  const composerController = mountComposer(composer, sendSupportText)

  const scrollController = createConversationScrollController(messages, {
    onUnseenChange(count) {
      newMessages.hidden = count === 0
      newMessages.textContent = count > 0 ? `↓ ${count} tin mới` : ''
    },
  })
  newMessages.addEventListener('click', () => scrollController.scrollToLatest())

  let lastRenderedRevision = -1

  const render = () => {
    const messageState = getChatMessageState()
    const model = buildCustomerChatViewModel(getChatRuntimeState(), messageState)
    title.textContent = model.title
    status.textContent = model.error ? 'Không thể kết nối' : model.status
    composerController.setEnabled(model.canSend)
    composerController.setDraftKey(messageState.conversationId)

    if (messageState.messageRevision !== lastRenderedRevision) {
      const change = messageState.lastChange ?? { kind: 'sync' as const, count: 0 }
      scrollController.beforeMessagesChanged({
        kind: change.kind,
        addedCount: change.count,
      })

      if (model.messages.length > 0) {
        const result = renderMessageList(messages, model.messages, model.currentProfileId)
        scrollController.afterMessagesChanged({
          kind: change.kind,
          addedCount: Math.max(change.count, result.addedCount),
        })
      } else {
        const placeholder = document.createElement('div')
        placeholder.className = 'chat-empty'
        placeholder.textContent =
          model.phase === 'error'
            ? 'Không thể tải cuộc trò chuyện.'
            : messageState.syncing
              ? 'Đang đồng bộ…'
              : 'Bạn cần hỗ trợ gì?'
        messages.replaceChildren(placeholder)
        scrollController.afterMessagesChanged({
          kind: change.kind,
          addedCount: 0,
        })
      }

      lastRenderedRevision = messageState.messageRevision
    }
  }

  const stopChat = subscribeChatRuntime(render)
  const stopMessages = subscribeChatMessages(render)

  const viewportListener = () => scrollController.onViewportChange()
  window.visualViewport?.addEventListener('resize', viewportListener)
  window.visualViewport?.addEventListener('scroll', viewportListener)

  const onMessageScroll = () => {
    const state = getChatMessageState()
    if (
      messages.scrollTop <= 140 &&
      state.hasOlder &&
      !state.isLoadingOlder &&
      state.messages.length > 0
    ) {
      void loadOlderSupportMessages()
    }
  }
  messages.addEventListener('scroll', onMessageScroll, { passive: true })

  render()

  return () => {
    stopChat()
    stopMessages()
    menu.destroy()
    profileForm.destroy()
    composerController.destroy()
    scrollController.destroy()
    messages.removeEventListener('scroll', onMessageScroll)
    window.visualViewport?.removeEventListener('resize', viewportListener)
    window.visualViewport?.removeEventListener('scroll', viewportListener)
  }
}
