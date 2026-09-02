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

  const renderNormal = () => {
    const addButton = document.createElement('button')
    addButton.className = 'cw-composer__button cw-composer__button--add'
    addButton.type = 'button'
    setButtonIcon(addButton, 'plus', 'Thêm')
    addButton.addEventListener('click', () => options.onAttach?.())

    const actionButton = document.createElement('button')
    actionButton.className = 'cw-composer__button cw-composer__button--action'
    actionButton.type = 'button'

    const syncAction = () => {
      const hasText = textarea.value.trim().length > 0
      setButtonIcon(actionButton, hasText ? 'send' : 'mic', hasText ? 'Gửi' : 'Ghi âm')
    }

    actionButton.addEventListener('click', () => {
      const text = textarea.value.trim()
      if (text) {
        void options.onSend?.(text)
        textarea.value = ''
        syncAction()
      } else {
        void options.onVoiceStart?.()
      }
    })
    textarea.addEventListener('input', syncAction)
    textarea.addEventListener('focus', () => options.onFocus?.())
    syncAction()
    root.replaceChildren(addButton, textarea, actionButton)
  }

  const renderRecording = () => {
    const recording = document.createElement('div')
    recording.className = 'cw-composer__recording'

    const status = document.createElement('span')
    status.className = 'cw-composer__recording-status'
    status.textContent = 'Đang ghi âm'

    const stop = document.createElement('button')
    stop.className = 'cw-composer__recording-stop'
    stop.type = 'button'
    stop.textContent = 'Gửi'
    stop.addEventListener('click', () => void options.onVoiceStop?.())

    recording.append(status, stop)
    root.replaceChildren(recording)
  }

  renderNormal()
  options.host.replaceChildren(root)

  return {
    element: root,
    textarea,
    setRecording(recording) {
      if (recording) renderRecording()
      else renderNormal()
    },
    setText(text) {
      textarea.value = text
      if (!root.children.length || !root.children[1]) renderNormal()
    },
    destroy() {
      options.host.replaceChildren()
    },
  }
}
