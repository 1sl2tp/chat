import type { ConversationViewModel } from './contracts'
import { createChatHeader } from './chat-header'

export interface ConversationScreenMountOptions {
  root: HTMLElement
  model: ConversationViewModel
  onBack?: () => void
  onCall?: () => void
}

export interface MountedConversationScreen {
  timeline: HTMLElement
  composerHost: HTMLElement
  update(model: ConversationViewModel): void
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

  return {
    timeline,
    composerHost,
    update(model) {
      shell.dataset.conversationId = model.id
      timeline.dataset.conversationId = model.id
      header.update(model)
    },
    destroy() {
      options.root.replaceChildren()
    },
  }
}
