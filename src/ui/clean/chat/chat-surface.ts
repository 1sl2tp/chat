import type { ConversationActionsAdapter, ConversationViewModel } from '../../chatwoot-port/contracts'
import { presentMessages } from '../../chatwoot-port/messages/message-model'
import { createScrollOwner, type ScrollOwner } from '../../chatwoot-port/scroll/scroll-owner'
import { createCleanComposer, type CleanComposerView } from './composer'
import { createCleanMessageList } from './message-list'
import './chat.css'

export interface CleanChatSurfaceOptions {
  root: HTMLElement
  model: ConversationViewModel
  actions?: ConversationActionsAdapter
  enabled?: boolean
  onBack?: () => void
  onCall?: () => void
  onMenu?: () => void
}

export interface MountedCleanChatSurface {
  timeline: HTMLElement
  composerHost: HTMLElement
  update(model: ConversationViewModel): void
  setEnabled(enabled: boolean): void
  destroy(): void
}

function avatarText(title: string): string {
  return title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || 'HT'
}

function actionButton(className: string, label: string, glyph: string, handler: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `clean-chat__action ${className}`
  button.setAttribute('aria-label', label)
  button.textContent = glyph
  button.addEventListener('click', handler)
  return button
}

export function mountCleanChatSurface(options: CleanChatSurfaceOptions): MountedCleanChatSurface {
  const shell = document.createElement('section')
  shell.className = 'clean-chat'
  shell.dataset.conversationId = options.model.id

  const header = document.createElement('header')
  header.className = 'clean-chat__header'

  const leading = document.createElement('div')
  leading.className = 'clean-chat__leading'

  if (options.onBack) {
    leading.append(actionButton('clean-chat__back', 'Quay lại', '‹', options.onBack))
  }

  const avatar = document.createElement('div')
  avatar.className = 'clean-chat__avatar'
  const avatarLabel = document.createElement('span')
  avatarLabel.className = 'clean-chat__avatar-label'
  const online = document.createElement('span')
  online.className = 'clean-chat__online-dot'
  online.setAttribute('aria-hidden', 'true')
  avatar.append(avatarLabel, online)

  const identity = document.createElement('div')
  identity.className = 'clean-chat__identity'
  const title = document.createElement('strong')
  title.className = 'clean-chat__title'
  const subtitle = document.createElement('span')
  subtitle.className = 'clean-chat__subtitle'
  identity.append(title, subtitle)
  leading.append(avatar, identity)

  const actionsHost = document.createElement('div')
  actionsHost.className = 'clean-chat__actions'

  const callHandler = options.onCall ?? (() => { void options.actions?.startCall() })
  let callButton: HTMLButtonElement | null = null
  if (options.model.canCall && (options.onCall || options.actions)) {
    callButton = actionButton('clean-chat__call', 'Gọi', '☎', callHandler)
    actionsHost.append(callButton)
  }
  if (options.onMenu) actionsHost.append(actionButton('clean-chat__menu', 'Menu', '⋮', options.onMenu))

  header.append(leading, actionsHost)

  const timeline = document.createElement('main')
  timeline.className = 'clean-chat__timeline clean-scrollbar'
  timeline.dataset.conversationId = options.model.id

  const composerHost = document.createElement('footer')
  composerHost.className = 'clean-chat__composer'

  shell.append(header, timeline, composerHost)
  options.root.replaceChildren(shell)

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.hidden = true
  fileInput.setAttribute('aria-hidden', 'true')
  shell.append(fileInput)

  const list = createCleanMessageList(timeline)

  const newMessage = document.createElement('button')
  newMessage.type = 'button'
  newMessage.className = 'clean-chat__new-message'
  newMessage.textContent = 'Tin nhắn mới ↓'
  newMessage.hidden = true
  timeline.append(newMessage)

  let currentModel = options.model
  let enabled = options.enabled ?? true
  let composer: CleanComposerView | null = null
  let scroll: ScrollOwner | null = null

  scroll = createScrollOwner({
    timeline,
    resizeTarget: list.element,
    onNewMessageVisibilityChange(visible) {
      newMessage.hidden = !visible
    },
  })

  if (options.actions) {
    const runtime = options.actions
    composer = createCleanComposer({
      host: composerHost,
      onAttach: () => fileInput.click(),
      async onSend(text) {
        await runtime.sendText(text)
        scroll?.onLocalMessageSent()
      },
      async onVoiceStart() {
        await runtime.startVoiceRecording()
        composer?.setRecording(true)
      },
      async onVoiceStop() {
        await runtime.stopVoiceRecording()
        composer?.setRecording(false)
        scroll?.onLocalMessageSent()
      },
      async onVoiceCancel() {
        await runtime.cancelVoiceRecording?.()
        composer?.setRecording(false)
      },
      onFocus: () => scroll?.onComposerFocus(),
    })
    composer.setEnabled(enabled)
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file || !options.actions) return
    void options.actions.sendAttachment(file)
      .then(() => scroll?.onLocalMessageSent())
      .catch(() => {})
  })
  newMessage.addEventListener('click', () => scroll?.scrollToLatest())

  const syncHeader = (model: ConversationViewModel) => {
    avatarLabel.textContent = avatarText(model.title)
    title.textContent = model.title || 'Hỗ trợ'
    subtitle.textContent = model.subtitle || 'Đang hoạt động'
    subtitle.hidden = !model.subtitle
    if (callButton) callButton.hidden = !model.canCall
  }

  syncHeader(currentModel)
  list.update(presentMessages(currentModel.messages))
  scroll.onInitialRender()

  return {
    timeline,
    composerHost,
    update(model) {
      const previousLast = currentModel.messages.at(-1)
      currentModel = model
      shell.dataset.conversationId = model.id
      timeline.dataset.conversationId = model.id
      syncHeader(model)
      list.update(presentMessages(model.messages))

      const nextLast = model.messages.at(-1)
      if (!nextLast || nextLast.id === previousLast?.id) {
        scroll?.onTimelineResize()
        return
      }
      if (nextLast.direction === 'outgoing') scroll?.onLocalMessageSent()
      else scroll?.onRemoteMessageAdded()
    },
    setEnabled(next) {
      enabled = next
      composer?.setEnabled(enabled)
    },
    destroy() {
      scroll?.destroy()
      composer?.destroy()
      list.destroy()
      fileInput.remove()
      newMessage.remove()
      scroll = null
      composer = null
      options.root.replaceChildren()
    },
  }
}
