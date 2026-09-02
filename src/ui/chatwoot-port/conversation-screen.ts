import type { ConversationActionsAdapter, ConversationViewModel } from './contracts'
import { createChatHeader } from './chat-header'
import { createComposer, type ComposerView } from './composer/composer'
import { createMessageListView, type MessageListView } from './messages/message-list'
import { presentMessages } from './messages/message-model'
import { createScrollOwner, type ScrollOwner } from './scroll/scroll-owner'
import './tokens.css'
import './conversation-shell.css'
import './messages/message.css'
import './composer/composer.css'

export interface ConversationScreenMountOptions {
  root: HTMLElement
  model: ConversationViewModel
  actions?: ConversationActionsAdapter
  enabled?: boolean
  onBack?: () => void
  onCall?: () => void
}

export interface MountedConversationScreen {
  timeline: HTMLElement
  composerHost: HTMLElement
  update(model: ConversationViewModel): void
  setEnabled(enabled: boolean): void
  destroy(): void
}

export function mountConversationScreen(options: ConversationScreenMountOptions): MountedConversationScreen {
  const shell = document.createElement('section')
  shell.className = 'cw-conversation'
  shell.dataset.conversationId = options.model.id

  const header = createChatHeader({
    model: options.model,
    onBack: options.onBack,
    onCall: options.onCall,
  })

  const timeline = document.createElement('main')
  timeline.className = 'cw-conversation__timeline'
  timeline.dataset.conversationId = options.model.id

  const composerHost = document.createElement('footer')
  composerHost.className = 'cw-conversation__composer'

  shell.append(header.element, timeline, composerHost)
  options.root.replaceChildren(shell)

  let currentModel = options.model
  let enabled = options.enabled ?? true
  let messageList: MessageListView | null = null
  let composer: ComposerView | null = null
  let scroll: ScrollOwner | null = null
  let fileInput: HTMLInputElement | null = null
  let newMessageIndicator: HTMLButtonElement | null = null

  if (options.actions) {
    const actions = options.actions
    messageList = createMessageListView(timeline)

    newMessageIndicator = document.createElement('button')
    newMessageIndicator.type = 'button'
    newMessageIndicator.className = 'cw-conversation__new-message'
    newMessageIndicator.textContent = 'Tin nhắn mới ↓'
    newMessageIndicator.hidden = true
    newMessageIndicator.setAttribute('aria-label', 'Cuộn xuống tin nhắn mới')
    timeline.append(newMessageIndicator)

    scroll = createScrollOwner({
      timeline,
      resizeTarget: messageList.element,
      onNewMessageVisibilityChange(visible) {
        if (newMessageIndicator) newMessageIndicator.hidden = !visible
      },
    })

    fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.hidden = true
    fileInput.setAttribute('aria-hidden', 'true')
    shell.append(fileInput)

    composer = createComposer({
      host: composerHost,
      onAttach: () => fileInput?.click(),
      async onSend(text) {
        await actions.sendText(text)
        scroll?.onLocalMessageSent()
      },
      async onVoiceStart() {
        await actions.startVoiceRecording()
        composer?.setRecording(true)
      },
      async onVoiceStop() {
        await actions.stopVoiceRecording()
        composer?.setRecording(false)
        scroll?.onLocalMessageSent()
      },
      async onVoiceCancel() {
        await actions.cancelVoiceRecording?.()
        composer?.setRecording(false)
      },
      onFocus: () => scroll?.onComposerFocus(),
    })
    composer.setEnabled(enabled)

    fileInput.addEventListener('change', () => {
      const file = fileInput?.files?.[0]
      if (fileInput) fileInput.value = ''
      if (!file) return
      void actions.sendAttachment(file).then(() => scroll?.onLocalMessageSent()).catch(() => {})
    })

    newMessageIndicator.addEventListener('click', () => scroll?.scrollToLatest())
    messageList.update(presentMessages(currentModel.messages))
    scroll.onInitialRender()
  }

  const update = (model: ConversationViewModel) => {
    const previousLast = currentModel.messages.at(-1)
    currentModel = model
    shell.dataset.conversationId = model.id
    timeline.dataset.conversationId = model.id
    header.update(model)

    if (!messageList) return
    messageList.update(presentMessages(model.messages))

    const nextLast = model.messages.at(-1)
    const hasNewTail = Boolean(nextLast && nextLast.id !== previousLast?.id)
    if (!hasNewTail) {
      scroll?.onTimelineResize()
      return
    }

    if (nextLast?.direction === 'outgoing') scroll?.onLocalMessageSent()
    else scroll?.onRemoteMessageAdded()
  }

  return {
    timeline,
    composerHost,
    update,
    setEnabled(nextEnabled) {
      enabled = nextEnabled
      composer?.setEnabled(enabled)
    },
    destroy() {
      scroll?.destroy()
      composer?.destroy()
      messageList?.destroy()
      fileInput?.remove()
      newMessageIndicator?.remove()
      scroll = null
      composer = null
      messageList = null
      fileInput = null
      newMessageIndicator = null
      options.root.replaceChildren()
    },
  }
}
