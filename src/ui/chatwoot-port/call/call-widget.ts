import { formatCallDuration } from '../../../call/presentation'
import type { VoiceCallSession, VoiceCallState } from '../../../call/voice-session'
import './call-widget.css'

export function callStatusText(state: VoiceCallState): string {
  if (state.resumeRequired) return 'Chạm để tiếp tục cuộc gọi'
  if (state.phase === 'incoming') return 'Cuộc gọi đến'
  if (state.phase === 'outgoing') return 'Đang gọi…'
  if (state.phase === 'connecting') return 'Đang kết nối…'
  if (state.phase === 'reconnecting') return 'Đang nối lại…'
  if (state.phase === 'active') return 'Cuộc gọi đang diễn ra'
  if (state.phase === 'error') return 'Cuộc gọi lỗi'
  return ''
}

type CallIcon = 'phone' | 'end' | 'mute' | 'unmute' | 'speaker' | 'minimize' | 'hide' | 'expand' | 'close'

function iconClass(name: CallIcon): string {
  if (name === 'phone') return 'fa-solid fa-phone'
  if (name === 'end') return 'fa-solid fa-phone-slash'
  if (name === 'mute') return 'fa-solid fa-microphone-slash'
  if (name === 'unmute') return 'fa-solid fa-microphone'
  if (name === 'speaker') return 'fa-solid fa-volume-high'
  if (name === 'minimize') return 'fa-solid fa-window-minimize'
  if (name === 'hide') return 'fa-solid fa-eye-slash'
  if (name === 'expand') return 'fa-solid fa-up-right-and-down-left-from-center'
  return 'fa-solid fa-xmark'
}

function icon(name: CallIcon): HTMLElement {
  const element = document.createElement('i')
  element.className = iconClass(name)
  element.setAttribute('aria-hidden', 'true')
  return element
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'HT'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('vi-VN')
  return `${parts[0]![0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toLocaleUpperCase('vi-VN')
}

function actionButton(
  label: string,
  iconName: CallIcon,
  action: () => void,
  tone: 'neutral' | 'green' | 'red' | 'amber' = 'neutral',
  modifier = '',
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `cw-call-card__action cw-call-card__action--${tone}${modifier ? ` ${modifier}` : ''}`
  button.append(icon(iconName))
  button.setAttribute('aria-label', label)
  button.title = label
  button.addEventListener('click', action)
  return button
}

function durationText(state: VoiceCallState): string {
  if (state.phase !== 'active') return ''
  return formatCallDuration(Date.now() - (state.connectedAt ?? Date.now()))
}

function renderWindowActions(session: VoiceCallSession): HTMLElement {
  const actions = document.createElement('div')
  actions.className = 'cw-call-card__window-actions'
  actions.append(
    actionButton('Thu nhỏ cuộc gọi', 'minimize', () => session.setDisplay('compact'), 'neutral', 'cw-call-card__window-button'),
    actionButton('Ẩn cuộc gọi', 'hide', () => session.setDisplay('hidden'), 'neutral', 'cw-call-card__window-button'),
  )
  return actions
}

function renderFullCard(state: VoiceCallState, session: VoiceCallSession): HTMLElement {
  const card = document.createElement('section')
  card.className = 'cw-call-card'
  card.dataset.phase = state.phase

  const top = document.createElement('div')
  top.className = 'cw-call-card__top'

  const status = document.createElement('div')
  status.className = 'cw-call-card__status'
  const statusDot = document.createElement('span')
  statusDot.className = 'cw-call-card__status-dot'
  const statusText = document.createElement('span')
  statusText.textContent = callStatusText(state)
  status.append(statusDot, statusText)

  const context = document.createElement('span')
  context.className = 'cw-call-card__context'
  context.textContent = state.direction === 'incoming' ? 'TAPHOA · Cuộc gọi đến' : 'TAPHOA · Hỗ trợ'

  const duration = document.createElement('span')
  duration.className = 'cw-call-card__duration'
  duration.textContent = durationText(state)

  top.append(status, context, duration, renderWindowActions(session))

  const main = document.createElement('div')
  main.className = 'cw-call-card__main'

  const identity = document.createElement('div')
  identity.className = 'cw-call-card__identity'
  const avatar = document.createElement('div')
  avatar.className = 'cw-call-card__avatar'
  avatar.textContent = initials(state.peerName || 'Hỗ trợ')
  const name = document.createElement('strong')
  name.textContent = state.peerName || 'Cuộc gọi thoại'
  const subtitle = document.createElement('span')
  subtitle.textContent = state.error || state.permissionNotice || callStatusText(state)
  identity.append(avatar, name, subtitle)

  const controls = document.createElement('div')
  controls.className = 'cw-call-card__controls'

  if (state.phase === 'active') {
    const mute = actionButton(
      state.muted ? 'Mở mic' : 'Tắt mic',
      state.muted ? 'unmute' : 'mute',
      () => session.toggleMute(),
      state.muted ? 'amber' : 'neutral',
      'cw-call-card__control',
    )
    controls.append(mute)

    if (state.speakerAvailable) {
      controls.append(actionButton(
        state.speakerSelected ? 'Chuyển về loa trong' : 'Bật loa ngoài',
        'speaker',
        () => { void session.chooseSpeaker() },
        state.speakerSelected ? 'green' : 'neutral',
        'cw-call-card__control',
      ))
    }
  }

  if (state.audioBlocked) {
    controls.append(actionButton('Bật âm thanh', 'speaker', () => session.startAudio(), 'amber', 'cw-call-card__control'))
  }

  const primary = document.createElement('div')
  primary.className = 'cw-call-card__primary-actions'

  if (state.phase === 'error') {
    primary.append(actionButton('Đóng', 'close', () => session.dismissError(), 'red', 'cw-call-card__primary'))
  } else if (state.phase === 'incoming') {
    primary.append(
      actionButton('Từ chối', 'end', () => { void session.decline() }, 'red', 'cw-call-card__primary'),
      actionButton('Nhận', 'phone', () => { void session.accept() }, 'green', 'cw-call-card__primary cw-call-card__primary--accept'),
    )
  } else if (state.resumeRequired) {
    primary.append(
      actionButton('Kết thúc', 'end', () => { void session.hangup() }, 'red', 'cw-call-card__primary'),
      actionButton('Tiếp tục', 'phone', () => { void session.resumeFromUserGesture() }, 'green', 'cw-call-card__primary'),
    )
  } else {
    primary.append(actionButton('Kết thúc', 'end', () => { void session.hangup() }, 'red', 'cw-call-card__primary'))
  }

  main.append(identity)
  if (controls.children.length > 0) main.append(controls)
  main.append(primary)
  card.append(top, main)
  return card
}

function renderCompact(state: VoiceCallState, session: VoiceCallSession): HTMLElement {
  const compact = document.createElement('section')
  compact.className = 'cw-call-compact'

  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'cw-call-compact__main'
  open.setAttribute('aria-label', 'Mở cuộc gọi')
  open.addEventListener('click', () => session.setDisplay('full'))

  const avatar = document.createElement('span')
  avatar.className = 'cw-call-compact__avatar'
  avatar.textContent = initials(state.peerName || 'Hỗ trợ')
  const copy = document.createElement('span')
  copy.className = 'cw-call-compact__copy'
  const name = document.createElement('strong')
  name.textContent = state.peerName || 'Cuộc gọi thoại'
  const meta = document.createElement('small')
  meta.textContent = state.phase === 'active' ? durationText(state) : callStatusText(state)
  copy.append(name, meta)
  open.append(avatar, copy)

  const expand = actionButton('Mở toàn màn hình', 'expand', () => session.setDisplay('full'), 'neutral', 'cw-call-compact__button')
  const end = actionButton('Kết thúc', 'end', () => { void session.hangup() }, 'red', 'cw-call-compact__button')
  compact.append(open, expand, end)
  return compact
}

function renderHidden(state: VoiceCallState, session: VoiceCallSession): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'cw-call-hidden'
  button.dataset.phase = state.phase
  button.setAttribute('aria-label', 'Hiện cuộc gọi')
  button.title = state.peerName || callStatusText(state)
  button.append(icon('phone'))
  button.addEventListener('click', () => session.setDisplay('full'))
  return button
}

export function mountChatwootCallUi(host: HTMLElement, session: VoiceCallSession): () => void {
  let clock = 0

  const render = (state: VoiceCallState = session.getState()): void => {
    host.replaceChildren()
    if (state.phase === 'idle') return

    const widget = document.createElement('div')
    widget.className = 'cw-call-widget'
    widget.dataset.display = state.display
    widget.dataset.phase = state.phase

    if (state.display === 'hidden') widget.append(renderHidden(state, session))
    else if (state.display === 'compact') widget.append(renderCompact(state, session))
    else widget.append(renderFullCard(state, session))

    host.append(widget)
  }

  const unsubscribe = session.subscribe(render)
  clock = window.setInterval(() => {
    if (session.getState().phase === 'active') render()
  }, 1000)

  return () => {
    unsubscribe()
    window.clearInterval(clock)
    host.replaceChildren()
  }
}
