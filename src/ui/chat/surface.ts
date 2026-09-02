import type { ChatMessage } from '../../chat/messages'
import { mountComposer, type ComposerController, type ComposerOptions } from './composer'
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
}

export function mountConversationSurface(options: ConversationSurfaceOptions): ConversationSurfaceController {
  const composer: ComposerController = mountComposer(options.composerHost, options.onSend, options.composer)
  const scroll = createConversationScrollController(options.messagesHost)

  const onViewport = () => scroll.onViewportChange()
  window.visualViewport?.addEventListener('resize', onViewport)
  window.visualViewport?.addEventListener('scroll', onViewport)

  return {
    render(state) {
      composer.setEnabled(state.canSend)
      scroll.capturePosition()

      if (state.messages.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'chat-empty'
        empty.textContent = state.emptyText ?? 'Chưa có tin nhắn.'
        options.messagesHost.replaceChildren(empty)
      } else {
        renderMessageList(options.messagesHost, state.messages, state.currentProfileId)
      }

      scroll.onMessagesChanged()
    },
    focusComposer() {
      composer.focus()
    },
    destroy() {
      composer.destroy()
      window.visualViewport?.removeEventListener('resize', onViewport)
      window.visualViewport?.removeEventListener('scroll', onViewport)
      options.messagesHost.replaceChildren()
    },
  }
}
