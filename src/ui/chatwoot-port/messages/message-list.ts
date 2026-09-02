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
