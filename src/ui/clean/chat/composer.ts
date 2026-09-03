export interface CleanComposerOptions {
  host: HTMLElement
  onAttach(): void
  onSend(text: string): Promise<void>
  onVoiceStart(): Promise<void>
  onVoiceStop(): Promise<void>
  onVoiceCancel?(): Promise<void>
  onFocus?(): void
}

export interface CleanComposerView {
  element: HTMLFormElement
  setEnabled(enabled: boolean): void
  setRecording(recording: boolean): void
  destroy(): void
}

export function createCleanComposer(options: CleanComposerOptions): CleanComposerView {
  const form = document.createElement('form')
  form.className = 'clean-composer'
  form.autocomplete = 'off'

  const attach = document.createElement('button')
  attach.type = 'button'
  attach.className = 'clean-composer__button clean-composer__attach'
  attach.setAttribute('aria-label', 'Đính kèm')
  attach.textContent = '⌕'

  const inputWrap = document.createElement('div')
  inputWrap.className = 'clean-composer__input-wrap'

  const input = document.createElement('textarea')
  input.className = 'clean-composer__input'
  input.rows = 1
  input.placeholder = 'Soạn tin nhắn…'
  input.setAttribute('aria-label', 'Soạn tin nhắn')

  const mic = document.createElement('button')
  mic.type = 'button'
  mic.className = 'clean-composer__button clean-composer__mic'
  mic.setAttribute('aria-label', 'Ghi âm')
  mic.textContent = '●'

  const send = document.createElement('button')
  send.type = 'submit'
  send.className = 'clean-composer__send'
  send.setAttribute('aria-label', 'Gửi')
  send.textContent = '➤'

  inputWrap.append(input, mic)
  form.append(attach, inputWrap, send)
  options.host.replaceChildren(form)

  let enabled = true
  let recording = false
  let pending = false

  const sync = () => {
    input.disabled = !enabled || pending || recording
    attach.disabled = !enabled || pending || recording
    mic.disabled = !enabled || pending
    send.disabled = !enabled || pending || recording || input.value.trim().length === 0
    form.classList.toggle('clean-composer--recording', recording)
    mic.classList.toggle('is-recording', recording)
    mic.setAttribute('aria-label', recording ? 'Dừng ghi âm' : 'Ghi âm')
    input.placeholder = recording ? 'Đang ghi âm…' : 'Soạn tin nhắn…'
  }

  const resize = () => {
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`
  }

  attach.addEventListener('click', () => options.onAttach())
  input.addEventListener('focus', () => options.onFocus?.())
  input.addEventListener('input', () => {
    resize()
    sync()
  })
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    form.requestSubmit()
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (!enabled || pending || recording || !text) return
    pending = true
    sync()
    try {
      await options.onSend(text)
      input.value = ''
      resize()
    } finally {
      pending = false
      sync()
      input.focus()
    }
  })

  mic.addEventListener('click', async () => {
    if (!enabled || pending) return
    pending = true
    sync()
    try {
      if (recording) {
        await options.onVoiceStop()
        recording = false
      } else {
        await options.onVoiceStart()
        recording = true
      }
    } finally {
      pending = false
      sync()
    }
  })

  form.addEventListener('keydown', async (event) => {
    if (event.key !== 'Escape' || !recording || !options.onVoiceCancel) return
    event.preventDefault()
    pending = true
    sync()
    try {
      await options.onVoiceCancel()
      recording = false
    } finally {
      pending = false
      sync()
    }
  })

  sync()

  return {
    element: form,
    setEnabled(next) {
      enabled = next
      sync()
    },
    setRecording(next) {
      recording = next
      sync()
    },
    destroy() {
      form.remove()
    },
  }
}
