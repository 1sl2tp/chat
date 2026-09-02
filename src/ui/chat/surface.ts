import { VoiceRecorderSession } from '../../chat/attachments/voice-recorder'
import type { ChatReactionSession } from '../../chat/reactions/session'
import type { ChatMessage } from '../../chat/messages'
import { setButtonIcon } from '../icons'
import { getConversationCapabilities } from './capabilities'
import { mountComposer, type ComposerController, type ComposerOptions } from './composer'
import { resolveActiveLinkPreview, type LinkPreviewResolver } from './link-preview'
import { renderMessageList } from './message-list'
import { createConversationScrollController } from './scroll-controller'

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

  const composerOptions: ComposerOptions = {
    ...options.composer,
    onAttach: options.composer?.onAttach ?? (() => fileInput.click()),
    onRecord: options.composer?.onRecord ?? (typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
      ? () => { void toggleRecording() }
      : undefined),
  }
  const composer: ComposerController = mountComposer(options.composerHost, options.onSend, composerOptions)
  options.composerHost.append(fileInput)
  const scroll = createConversationScrollController(options.messagesHost)

  async function sendAttachment(file: File): Promise<void> {
    const capabilities = getConversationCapabilities()
    if (!capabilities) throw new Error('conversation_capabilities_unavailable')
    await capabilities.sendAttachment(file)
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

  function renderState(state: ConversationSurfaceRenderState): void {
    if (destroyed) return
    lastState = state
    composer.setEnabled(state.canSend)
    scroll.capturePosition()

    const capabilities = getConversationCapabilities()
    const reactionSession = capabilities?.reactionSession ?? null
    if (reactionSession && reactionSession !== activeReactionSession) {
      activeReactionSession = reactionSession
      reactionSession.start(() => {
        if (lastState) renderState(lastState)
      })
    }

    if (reactionSession) {
      void reactionSession.sync(state.messages.map((message) => message.id), state.currentProfileId).catch((error) => {
        console.error('Reaction sync failed', error)
      })
    }

    if (state.messages.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'chat-empty'
      empty.textContent = state.emptyText ?? 'Chưa có tin nhắn.'
      options.messagesHost.replaceChildren(empty)
    } else {
      renderMessageList(options.messagesHost, state.messages, state.currentProfileId, {
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

    scroll.onMessagesChanged()
  }

  return {
    render: renderState,
    focusComposer() {
      composer.focus()
    },
    destroy() {
      destroyed = true
      composer.destroy()
      fileInput.remove()
      viewer.remove()
      window.visualViewport?.removeEventListener('resize', onViewport)
      window.visualViewport?.removeEventListener('scroll', onViewport)
      options.messagesHost.replaceChildren()
    },
  }
}
