import { composerEnterAction, isMobileComposerEnvironment } from '../../chat/ui/composer-behavior'
import { iconSvg } from '../icons'

export function normalizeDraft(text: string): string {
  return text.trim()
}

export interface ComposerController {
  setEnabled(enabled: boolean): void
  focus(): void
  destroy(): void
}

export interface ComposerOptions {
  isMobile?: boolean
  onAttach?: () => void
  onRecord?: () => void
}

export function mountComposer(
  container: HTMLElement,
  onSend: (text: string) => Promise<void>,
  options: ComposerOptions = {},
): ComposerController {
  const input = document.createElement('textarea')
  input.className = 'chat-composer__input'
  input.rows = 1
  input.placeholder = 'Nhập tin nhắn…'
  input.setAttribute('aria-label', 'Tin nhắn')
  input.setAttribute('enterkeyhint', options.isMobile ?? isMobileComposerEnvironment() ? 'enter' : 'send')

  const plus = document.createElement('button')
  plus.type = 'button'
  plus.className = 'chat-composer__plus chat-icon-button'
  plus.innerHTML = iconSvg('plus')
  plus.setAttribute('aria-label', 'Đính kèm')
  plus.disabled = !options.onAttach

  const mic = document.createElement('button')
  mic.type = 'button'
  mic.className = 'chat-composer__mic chat-icon-button'
  mic.innerHTML = iconSvg('mic')
  mic.setAttribute('aria-label', 'Ghi âm')
  mic.disabled = !options.onRecord

  const send = document.createElement('button')
  send.type = 'button'
  send.className = 'chat-composer__send chat-icon-button'
  send.innerHTML = iconSvg('send')
  send.setAttribute('aria-label', 'Gửi')

  const isMobile = options.isMobile ?? isMobileComposerEnvironment()
  let enabled = false
  let sending = false

  const sync = () => {
    const hasText = normalizeDraft(input.value).length > 0
    send.disabled = !enabled || !hasText || sending
    plus.disabled = !enabled || sending || !options.onAttach
    mic.disabled = !enabled || sending || !options.onRecord
  }

  const submit = async () => {
    const text = normalizeDraft(input.value)
    if (!enabled || !text || sending) return
    sending = true
    sync()
    try {
      await onSend(text)
      input.value = ''
      input.style.height = ''
    } finally {
      sending = false
      sync()
    }
  }

  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`
    sync()
  })

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return
    if (composerEnterAction({ isMobile, shiftKey: event.shiftKey }) === 'newline') return
    event.preventDefault()
    void submit()
  })
  plus.addEventListener('click', () => options.onAttach?.())
  mic.addEventListener('click', () => options.onRecord?.())
  send.addEventListener('click', () => void submit())

  container.replaceChildren(plus, input, mic, send)
  sync()

  return {
    setEnabled(next) {
      enabled = next
      input.disabled = !next
      sync()
    },
    focus() {
      input.focus()
    },
    destroy() {
      container.replaceChildren()
    },
  }
}
