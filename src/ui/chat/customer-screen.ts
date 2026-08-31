import { getChatMessageState, subscribeChatMessages } from '../../chat/message-runtime'
import { sendSupportText } from '../../chat/runtime'
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

  const footer = document.createElement('footer')
  footer.className = 'chat-footer'
  const composer = document.createElement('div')
  composer.className = 'chat-composer'
  const version = document.createElement('div')
  version.className = 'chat-version'
  version.textContent = formatVersionLabel(import.meta.env.VITE_BUILD_ID ?? 'dev')
  footer.append(composer, version)

  screen.append(header, messages, footer)
  root.replaceChildren(screen)

  const profileForm = mountProfileForm(screen)
  const menu = mountOverflowMenu(actions, {
    onEditProfile: () => profileForm.open(currentDisplayName()),
  })
  menuButton.addEventListener('click', () => menu.toggle())
  const composerController = mountComposer(composer, sendSupportText)
  const scrollController = createConversationScrollController(messages)

  const render = () => {
    const model = buildCustomerChatViewModel(getChatRuntimeState(), getChatMessageState())
    title.textContent = model.title
    status.textContent = model.error ? 'Không thể kết nối' : model.status
    composerController.setEnabled(model.canSend)

    if (model.messages.length > 0) {
      renderMessageList(messages, model.messages, model.currentProfileId)
      scrollController.onMessagesChanged()
    } else {
      const placeholder = document.createElement('div')
      placeholder.className = 'chat-empty'
      placeholder.textContent = model.phase === 'error' ? 'Không thể tải cuộc trò chuyện.' : 'Bạn cần hỗ trợ gì?'
      messages.replaceChildren(placeholder)
    }
  }

  const stopChat = subscribeChatRuntime(render)
  const stopMessages = subscribeChatMessages(render)

  const viewportListener = () => scrollController.onViewportChange()
  window.visualViewport?.addEventListener('resize', viewportListener)
  window.visualViewport?.addEventListener('scroll', viewportListener)

  render()

  return () => {
    stopChat()
    stopMessages()
    menu.destroy()
    profileForm.destroy()
    composerController.destroy()
    window.visualViewport?.removeEventListener('resize', viewportListener)
    window.visualViewport?.removeEventListener('scroll', viewportListener)
  }
}
