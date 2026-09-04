export function normalizeDraft(text: string): string {
  return text.trim()
}

export interface ComposerController {
  setEnabled(enabled: boolean): void
  setDraftKey(key: string | null): void
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
  let draftKey: string | null = null

  const storageKey = (key: string) => `taphoa.chat.draft.${key}`

  const saveDraft = () => {
    if (!draftKey || typeof localStorage === 'undefined') return
    try {
      if (input.value.length > 0) localStorage.setItem(storageKey(draftKey), input.value)
      else localStorage.removeItem(storageKey(draftKey))
    } catch {
      // Draft persistence is a fast-path convenience only.
    }
  }

  const clearDraft = () => {
    if (!draftKey || typeof localStorage === 'undefined') return
    try {
      localStorage.removeItem(storageKey(draftKey))
    } catch {
      // Ignore storage failures.
    }
  }

  const sync = () => {
    const hasText = normalizeDraft(input.value).length > 0
    send.disabled = !enabled || !hasText || sending
  }

  const submit = async () => {
    const text = normalizeDraft(input.value)
    if (!enabled || !text || sending) return
    const draft = input.value
    sending = true
    input.value = ''
    input.style.height = ''
    clearDraft()
    sync()

    try {
      await onSend(text)
    } catch (error) {
      // Optimistic send already created a failed bubble. Restore the draft only
      // when the user has not started composing a different message.
      if (input.value.length === 0) {
        input.value = draft
        input.style.height = `${Math.min(input.scrollHeight, 120)}px`
        saveDraft()
      }
      console.error('Message send failed', error)
    } finally {
      sending = false
      sync()
    }
  }

  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`
    saveDraft()
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
    setDraftKey(nextKey) {
      if (draftKey === nextKey) return
      saveDraft()
      draftKey = nextKey
      if (!draftKey || typeof localStorage === 'undefined') return
      try {
        const saved = localStorage.getItem(storageKey(draftKey))
        if (saved !== null && input.value.length === 0) {
          input.value = saved
          input.style.height = 'auto'
          input.style.height = `${Math.min(input.scrollHeight, 120)}px`
          sync()
        }
      } catch {
        // Ignore storage failures.
      }
    },
    destroy() {
      container.replaceChildren()
    },
  }
}
