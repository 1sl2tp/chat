export function normalizeDraft(text: string): string {
  return text.trim()
}

export interface ComposerController {
  setEnabled(enabled: boolean): void
  destroy(): void
}

export function mountComposer(
  container: HTMLElement,
  onSend: (text: string) => Promise<void>,
): ComposerController {
  const input = document.createElement('textarea')
  input.className = 'chat-composer__input'
  input.rows = 1
  input.placeholder = 'Nhập tin nhắn...'
  input.setAttribute('aria-label', 'Tin nhắn')

  const plus = document.createElement('button')
  plus.type = 'button'
  plus.className = 'chat-composer__plus'
  plus.textContent = '+'
  plus.disabled = true
  plus.setAttribute('aria-label', 'Tệp đính kèm chưa khả dụng')

  const send = document.createElement('button')
  send.type = 'button'
  send.className = 'chat-composer__send'
  send.textContent = '➤'
  send.setAttribute('aria-label', 'Gửi')

  let enabled = false
  let sending = false

  const sync = () => {
    const hasText = normalizeDraft(input.value).length > 0
    send.disabled = !enabled || !hasText || sending
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
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      void submit()
    }
  })
  send.addEventListener('click', () => void submit())

  container.replaceChildren(plus, input, send)
  sync()

  return {
    setEnabled(next) {
      enabled = next
      input.disabled = !next
      sync()
    },
    destroy() {
      container.replaceChildren()
    },
  }
}
