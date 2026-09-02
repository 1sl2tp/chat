import { setButtonIcon } from '../../icons'

export interface ComposerOptions {
  host: HTMLElement
  onAttach?: () => void
  onSend?: (text: string) => void | Promise<void>
  onVoiceStart?: () => void | Promise<void>
  onVoiceStop?: () => void | Promise<void>
  onFocus?: () => void
}

export interface ComposerView {
  element: HTMLElement
  textarea: HTMLTextAreaElement
  setEnabled(enabled: boolean): void
  setRecording(recording: boolean): void
  setText(text: string): void
  destroy(): void
}

export function createComposer(options: ComposerOptions): ComposerView {
  const root = document.createElement('div')
  root.className = 'cw-composer'

  const textarea = document.createElement('textarea')
  textarea.className = 'cw-composer__input'
  textarea.placeholder = 'Nhập tin nhắn…'
  textarea.setAttribute('aria-label', 'Nhập tin nhắn')

  let enabled = true
  let recording = false
  let controls: Array<HTMLButtonElement | HTMLTextAreaElement> = []
  let actionButton: HTMLButtonElement | null = null

  const syncEnabled = () => {
    for (const control of controls) control.disabled = !enabled
  }

  const syncAction = () => {
    if (!actionButton) return
    const hasText = textarea.value.trim().length > 0
    setButtonIcon(actionButton, hasText ? 'send' : 'mic', hasText ? 'Gửi' : 'Ghi âm')
  }

  textarea.addEventListener('input', syncAction)
  textarea.addEventListener('focus', () => options.onFocus?.())

  const renderNormal = () => {
    recording = false
    const addButton = document.createElement('button')
    addButton.className = 'cw-composer__button cw-composer__button--add'
    addButton.type = 'button'
    setButtonIcon(addButton, 'plus', 'Thêm')
    addButton.addEventListener('click', () => options.onAttach?.())

    actionButton = document.createElement('button')
    actionButton.className = 'cw-composer__button cw-composer__button--action'
    actionButton.type = 'button'
    actionButton.addEventListener('click', () => {
      if (!enabled) return
      const text = textarea.value.trim()
      if (text) {
        void Promise.resolve(options.onSend?.(text)).then(() => {
          textarea.value = ''
          syncAction()
        }).catch(() => {})
      } else {
        void options.onVoiceStart?.()
      }
    })

    controls = [addButton, textarea, actionButton]
    syncAction()
    syncEnabled()
    root.replaceChildren(addButton, textarea, actionButton)
  }

  const renderRecording = () => {
    recording = true
    actionButton = null
    const recordingRow = document.createElement('div')
    recordingRow.className = 'cw-composer__recording'

    const status = document.createElement('span')
    status.className = 'cw-composer__recording-status'
    status.textContent = 'Đang ghi âm'

    const stop = document.createElement('button')
    stop.className = 'cw-composer__recording-stop'
    stop.type = 'button'
    stop.textContent = 'Gửi'
    stop.addEventListener('click', () => {
      if (!enabled) return
      void options.onVoiceStop?.()
    })

    controls = [stop]
    syncEnabled()
    recordingRow.append(status, stop)
    root.replaceChildren(recordingRow)
  }

  renderNormal()
  options.host.replaceChildren(root)

  return {
    element: root,
    textarea,
    setEnabled(nextEnabled) {
      enabled = nextEnabled
      syncEnabled()
    },
    setRecording(nextRecording) {
      if (nextRecording === recording) return
      if (nextRecording) renderRecording()
      else renderNormal()
    },
    setText(text) {
      textarea.value = text
      syncAction()
    },
    destroy() {
      controls = []
      actionButton = null
      options.host.replaceChildren()
    },
  }
}
