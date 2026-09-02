import { composerEnterAction, isMobileComposerEnvironment } from '../../../chat/ui/composer-behavior'
import { setButtonIcon } from '../../icons'

export interface ComposerOptions {
  host: HTMLElement
  isMobile?: boolean
  onAttach?: () => void
  onSend?: (text: string) => void | Promise<void>
  onVoiceStart?: () => void | Promise<void>
  onVoiceStop?: () => void | Promise<void>
  onVoiceCancel?: () => void | Promise<void>
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

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}

export function createComposer(options: ComposerOptions): ComposerView {
  const root = document.createElement('div')
  root.className = 'cw-composer'

  const textarea = document.createElement('textarea')
  textarea.className = 'cw-composer__input'
  textarea.rows = 1
  textarea.placeholder = 'Nhập tin nhắn…'
  textarea.setAttribute('aria-label', 'Nhập tin nhắn')
  const isMobile = options.isMobile ?? (typeof window !== 'undefined' ? isMobileComposerEnvironment(window) : false)
  textarea.setAttribute('enterkeyhint', isMobile ? 'enter' : 'send')

  let enabled = true
  let recording = false
  let controls: Array<HTMLButtonElement | HTMLTextAreaElement> = []
  let actionButton: HTMLButtonElement | null = null
  let recordingClock: ReturnType<typeof setInterval> | null = null

  const stopRecordingClock = () => {
    if (recordingClock !== null) globalThis.clearInterval(recordingClock)
    recordingClock = null
  }

  const syncEnabled = () => {
    for (const control of controls) control.disabled = !enabled
  }

  const syncAction = () => {
    if (!actionButton) return
    const hasText = textarea.value.trim().length > 0
    setButtonIcon(actionButton, hasText ? 'send' : 'mic', hasText ? 'Gửi' : 'Ghi âm')
  }

  const sendText = async () => {
    if (!enabled || recording) return
    const text = textarea.value.trim()
    if (!text) return
    await options.onSend?.(text)
    textarea.value = ''
    syncAction()
  }

  textarea.addEventListener('input', syncAction)
  textarea.addEventListener('focus', () => options.onFocus?.())
  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return
    if (composerEnterAction({ isMobile, shiftKey: event.shiftKey }) === 'newline') return
    event.preventDefault()
    void sendText().catch(() => {})
  })

  const renderNormal = () => {
    stopRecordingClock()
    recording = false
    const addButton = document.createElement('button')
    addButton.className = 'cw-composer__button cw-composer__button--add'
    addButton.type = 'button'
    setButtonIcon(addButton, 'plus', 'Đính kèm')
    addButton.addEventListener('click', () => options.onAttach?.())

    actionButton = document.createElement('button')
    actionButton.className = 'cw-composer__button cw-composer__button--action'
    actionButton.type = 'button'
    actionButton.addEventListener('click', () => {
      if (!enabled) return
      if (textarea.value.trim()) {
        void sendText().catch(() => {})
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
    stopRecordingClock()
    recording = true
    actionButton = null

    const recordingRow = document.createElement('div')
    recordingRow.className = 'cw-composer__recording'

    const status = document.createElement('div')
    status.className = 'cw-composer__recording-status'
    const dot = document.createElement('span')
    dot.className = 'cw-composer__recording-dot'
    const label = document.createElement('span')
    label.textContent = 'Đang ghi âm:'
    const timer = document.createElement('span')
    timer.className = 'cw-composer__recording-timer'
    timer.textContent = '00:00'
    status.append(dot, label, timer)

    const actions = document.createElement('div')
    actions.className = 'cw-composer__recording-actions'

    const cancel = document.createElement('button')
    cancel.className = 'cw-composer__recording-cancel'
    cancel.type = 'button'
    cancel.textContent = 'Hủy'
    cancel.addEventListener('click', () => {
      if (!enabled) return
      void Promise.resolve(options.onVoiceCancel?.()).then(() => renderNormal()).catch(() => {})
    })

    const stop = document.createElement('button')
    stop.className = 'cw-composer__recording-stop'
    stop.type = 'button'
    stop.textContent = 'Gửi'
    stop.addEventListener('click', () => {
      if (!enabled) return
      void options.onVoiceStop?.()
    })

    controls = [cancel, stop]
    syncEnabled()
    actions.append(cancel, stop)
    recordingRow.append(status, actions)
    root.replaceChildren(recordingRow)

    let elapsed = 0
    recordingClock = globalThis.setInterval(() => {
      elapsed += 1
      timer.textContent = formatElapsed(elapsed)
    }, 1000)
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
      stopRecordingClock()
      controls = []
      actionButton = null
      options.host.replaceChildren()
    },
  }
}
