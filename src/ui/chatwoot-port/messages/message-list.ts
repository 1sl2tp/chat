import type { PresentedMessage } from './message-model'
import { renderTextMessage } from './renderers/text'
import { renderImageMessage } from './renderers/image'
import { renderAudioMessage } from './renderers/audio'
import { renderFileMessage } from './renderers/file'
import { renderLinkMessage } from './renderers/link'
import { renderSystemMessage } from './renderers/system'
import { renderCallMessage } from './renderers/call'

export function renderMessage(message: PresentedMessage): HTMLElement {
  switch (message.kind) {
    case 'text':
      return renderTextMessage(message)
    case 'image':
      return renderImageMessage(message)
    case 'audio':
      return renderAudioMessage(message)
    case 'file':
      return renderFileMessage(message)
    case 'link':
      return renderLinkMessage(message)
    case 'system':
      return renderSystemMessage(message)
    case 'call':
      return renderCallMessage(message)
  }
}

export function renderMessageList(messages: PresentedMessage[]): HTMLElement {
  const list = document.createElement('div')
  list.className = 'cw-messages-list'
  for (const message of messages) list.append(renderMessage(message))
  return list
}

export interface MessageListView {
  element: HTMLElement
  update(messages: PresentedMessage[]): void
  destroy(): void
}

export function createMessageListView(host: HTMLElement): MessageListView {
  const list = document.createElement('div')
  list.className = 'cw-messages-list'
  host.replaceChildren(list)

  const nodeById = new Map<string, HTMLElement>()
  const signatureById = new Map<string, string>()

  const signature = (message: PresentedMessage) => JSON.stringify(message)

  const update = (messages: PresentedMessage[]) => {
    const nextIds = new Set(messages.map(message => message.id))
    for (const id of nodeById.keys()) {
      if (!nextIds.has(id)) {
        nodeById.delete(id)
        signatureById.delete(id)
      }
    }

    const nodes = messages.map(message => {
      const nextSignature = signature(message)
      const existing = nodeById.get(message.id)
      if (existing && signatureById.get(message.id) === nextSignature) return existing

      const next = renderMessage(message)
      nodeById.set(message.id, next)
      signatureById.set(message.id, nextSignature)
      return next
    })

    list.replaceChildren(...nodes)
  }

  return {
    element: list,
    update,
    destroy() {
      nodeById.clear()
      signatureById.clear()
      host.replaceChildren()
    },
  }
}
