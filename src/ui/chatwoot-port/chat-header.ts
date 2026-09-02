import type { ConversationViewModel } from './contracts'

export interface ChatHeaderOptions {
  model: ConversationViewModel
  onBack?: () => void
  onCall?: () => void
}

export interface ChatHeaderView {
  element: HTMLElement
  update(model: ConversationViewModel): void
}

function createHeaderButton(label: string, text: string, onPress?: () => void): HTMLElement {
  if (!onPress) {
    const spacer = document.createElement('span')
    spacer.className = 'cw-chat-header__spacer'
    return spacer
  }

  const button = document.createElement('button')
  button.className = 'cw-chat-header__button'
  button.type = 'button'
  button.ariaLabel = label
  button.textContent = text
  button.addEventListener('click', onPress)
  return button
}

export function createChatHeader(options: ChatHeaderOptions): ChatHeaderView {
  const header = document.createElement('header')
  header.className = 'cw-conversation__header'

  const row = document.createElement('div')
  row.className = 'cw-chat-header__row'

  const leading = createHeaderButton('Quay lại', '‹', options.onBack)

  const identity = document.createElement('div')
  identity.className = 'cw-chat-header__identity'

  const title = document.createElement('div')
  title.className = 'cw-chat-header__title'

  const subtitle = document.createElement('div')
  subtitle.className = 'cw-chat-header__subtitle'

  identity.append(title, subtitle)
  const trailing = createHeaderButton('Gọi', '☎', options.onCall)
  row.append(leading, identity, trailing)
  header.append(row)

  const update = (model: ConversationViewModel) => {
    title.textContent = model.title
    subtitle.textContent = model.subtitle ?? ''
  }

  update(options.model)
  return { element: header, update }
}
