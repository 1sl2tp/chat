import { VoiceRecorderSession } from '../../chat/attachments/voice-recorder'
import type { ChatReactionSession } from '../../chat/reactions/session'
import type { ChatMessage } from '../../chat/messages'
import { setButtonIcon } from '../icons'
import { getConversationCapabilities } from './capabilities'
import { compactCallTimelineMessages } from './call-timeline'
import { mountComposer, type ComposerController, type ComposerOptions } from './composer'
import { resolveActiveLinkPreview, type LinkPreviewResolver } from './link-preview'
import { renderMessageList } from './message-list'
import { createConversationScrollController } from './scroll-controller'
import './conversation-refinement.css'

export interface ConversationSurfaceRenderState {
  messages: ChatMessage[]
  currentProfileId: string | null
  canSend: boolean
  emptyText?: string
}

export interface ConversationSurfaceController {
  render(state: ConversationSurfaceRenderState): void
  focusComposer(): void
  destroy(): void
}

export interface ConversationSurfaceOptions {
  messagesHost: HTMLElement
  composerHost: HTMLElement
  onSend(text: string): Promise<void>
  composer?: ComposerOptions
  resolveLinkPreview?: LinkPreviewResolver
}

export function mountConversationSurface(options: ConversationSurfaceOptions): ConversationSurfaceController {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.hidden = true
  fileInput.setAttribute('aria-hidden', 'true')

  const viewer = document.createElement('div')
  viewer.className = 'chat-image-viewer'
  viewer.hidden = true
  viewer.setAttribute('role', 'dialog')
  viewer.setAttribute('aria-modal', 'true')
  viewer.setAttribute('aria-label', 'Xem ảnh')

  const viewerClose = document.createElement('button')
  viewerClose.type = 'button'
  viewerClose.className = 'chat-image-viewer__close chat-icon-button'
  setButtonIcon(viewerClose, 'close', 'Đóng ảnh')

  const viewerImage = document.createElement('img')

  const viewerActions = document.createElement('div')
  viewerActions.className = 'chat-image-viewer__actions'

  const viewerSave = document.createElement('a')
  viewerSave.className = 'chat-image-viewer__save'
  viewerSave.textContent = 'Lưu ảnh'
  viewerSave.setAttribute('aria-label', 'Lưu ảnh')

  const viewerShare = document.createElement('button')
  viewerShare.type = 'button'
  viewerShare.className = 'chat-image-viewer__share'
  viewerShare.textContent = 'Chia sẻ ảnh'
  viewerShare.setAttribute('aria-label', 'Chia sẻ ảnh')

  viewerActions.append(viewerSave, viewerShare)
  viewer.append(viewerClose, viewerImage, viewerActions)
  document.body.append(viewer)

  const voiceRecorder = new VoiceRecorderSession()
  let lastState: ConversationSurfaceRenderState | null = null
  let activeReactionSession: ChatReactionSession | null = null
  let activeImageUrl = ''
  let activeImageName = ''
  let destroyed = false

  const closeViewer = () => {
    viewer.hidden = true
    activeImageUrl = ''
    activeImageName = ''
    viewerImage.removeAttribute('src')
    viewerImage.alt = ''
    viewerSave.removeAttribute('href')
    viewerSave.removeAttribute('download')
  }

  const shareActiveImage = async () => {
    if (!activeImageUrl) return
    if (navigator.share) {
      await navigator.share({ title: activeImageName || 'Ảnh', url: activeImageUrl })
      return
    }
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(activeImageUrl)
  }

  viewerClose.addEventListener('click', closeViewer)
  viewerShare.addEventListener('click', () => void shareActiveImage().catch(() => {}))
  viewer.addEventListener('click', (event) => {
    if (event.target === viewer) closeViewer()
  })

  const scroll = createConversationScrollController(options.messagesHost)
  const contentResizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(() => scroll.onMessagesChanged())
  const observeMessageRows = () => {
    contentResizeObserver?.disconnect()
    for (const child of options.messagesHost.children) {
      if (child instanceof HTMLElement) contentResizeObserver?.observe(child)
    }
  }

  const newMessageIndicator = document.createElement('button')
  newMessageIndicator.type = 'button'
  newMessageIndicator.className = 'chat-new-message-indicator'
  newMessageIndicator.textContent = 'Tin nhắn mới ↓'
  newMessageIndicator.hidden = true
  newMessageIndicator.setAttribute('aria-label', 'Cuộn xuống tin nhắn mới')

  const followBottom = () => {
    newMessageIndicator.hidden = true
    scroll.scrollToBottom()
  }

  const composerOptions: ComposerOptions = {
    ...options.composer,
    onAttach: options.composer?.onAttach ?? (() => fileInput.click()),
    onRecord: options.composer?.onRecord ?? (typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
      ? () => { void toggleRecording() }
      : undefined),
    onFocus: () => {
      newMessageIndicator.hidden = true
      scroll.onComposerFocus()
      options.composer?.onFocus?.()
    },
  }
  const composer: ComposerController = mountComposer(options.composerHost, async (text) => {
    await options.onSend(text)
    followBottom()
  }, composerOptions)
  options.composerHost.append(fileInput, newMessageIndicator)

  newMessageIndicator.addEventListener('click', followBottom)
  const onMessagesScroll = () => {
    if (scroll.isFollowingBottom()) newMessageIndicator.hidden = true
  }
  options.messagesHost.addEventListener('scroll', onMessagesScroll, { passive: true })

  async function sendAttachment(file: File): Promise<void> {
    const capabilities = getConversationCapabilities()
    if (!capabilities) throw new Error('conversation_capabilities_unavailable')
    await capabilities.sendAttachment(file)
    followBottom()
  }

  async function toggleRecording(): Promise<void> {
    if (!voiceRecorder.isRecording()) {
      try {
        await voiceRecorder.start()
        composer.setRecording(true)
      } catch (error) {
        composer.setRecording(false)
        console.error('Voice recording failed to start', error)
      }
      return
    }

    try {
      const recording = await voiceRecorder.stop()
      composer.setRecording(false)
      await sendAttachment(recording.file)
    } catch (error) {
      composer.setRecording(false)
      console.error('Voice recording failed to send', error)
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    void sendAttachment(file).catch((error) => {
      console.error('Attachment send failed', error)
    })
  })

  const onViewport = () => scroll.onViewportChange()
  window.visualViewport?.addEventListener('resize', onViewport)
  window.visualViewport?.addEventListener('scroll', onViewport)

  function renderState(state: ConversationSurfaceRenderState, forceMessages = false): void {
    if (destroyed) return

    const previousState = lastState
    const messagesChanged = forceMessages
      || !previousState
      || previousState.messages !== state.messages
      || previousState.currentProfileId !== state.currentProfileId
      || previousState.emptyText !== state.emptyText

    if (messagesChanged) scroll.capturePosition()
    const wasFollowingBottom = scroll.isFollowingBottom()
    const previousCount = previousState?.messages.length ?? 0
    const previousLastId = previousState?.messages.at(-1)?.id ?? ''
    const nextLastId = state.messages.at(-1)?.id ?? ''
    const hasNewTail = Boolean(
      previousState
      && state.messages.length > previousCount
      && nextLastId
      && nextLastId !== previousLastId,
    )

    lastState = state
    composer.setEnabled(state.canSend)

    const capabilities = getConversationCapabilities()
    const reactionSession = capabilities?.reactionSession ?? null
    if (reactionSession && reactionSession !== activeReactionSession) {
      activeReactionSession = reactionSession
      reactionSession.start(() => {
        if (lastState) renderState(lastState, true)
      })
    }

    if (reactionSession && (!previousState || previousState.messages !== state.messages)) {
      void reactionSession.sync(state.messages.map((message) => message.id), state.currentProfileId).catch((error) => {
        console.error('Reaction sync failed', error)
      })
    }

    if (messagesChanged) {
      if (state.messages.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'chat-empty'
        empty.textContent = state.emptyText ?? 'Chưa có tin nhắn.'
        options.messagesHost.replaceChildren(empty)
      } else {
        const timelineMessages = compactCallTimelineMessages(state.messages)
        renderMessageList(options.messagesHost, timelineMessages, state.currentProfileId, {
          resolveAttachmentUrl: capabilities?.resolveAttachmentUrl,
          resolveLinkPreview: options.resolveLinkPreview ?? resolveActiveLinkPreview,
          getHeart: reactionSession ? (messageId) => reactionSession.getHeart(messageId) : undefined,
          onHeart: reactionSession ? (messageId) => reactionSession.toggleHeart(messageId) : undefined,
          onOpenImage(url, name) {
            activeImageUrl = url
            activeImageName = name
            viewerImage.src = url
            viewerImage.alt = name
            viewerSave.href = url
            viewerSave.download = name || 'image'
            viewer.hidden = false
          },
        })
      }

      observeMessageRows()
      if (hasNewTail && !wasFollowingBottom) newMessageIndicator.hidden = false
      else if (wasFollowingBottom) newMessageIndicator.hidden = true
      scroll.onMessagesChanged()
    }
  }

  return {
    render: renderState,
    focusComposer() {
      composer.focus()
    },
    destroy() {
      destroyed = true
      contentResizeObserver?.disconnect()
      composer.destroy()
      fileInput.remove()
      newMessageIndicator.remove()
      viewer.remove()
      options.messagesHost.removeEventListener('scroll', onMessagesScroll)
      window.visualViewport?.removeEventListener('resize', onViewport)
      window.visualViewport?.removeEventListener('scroll', onViewport)
      options.messagesHost.replaceChildren()
    },
  }
}
