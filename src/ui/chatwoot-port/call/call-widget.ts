import { formatCallDuration } from '../../../call/presentation'
import type { VoiceCallSession, VoiceCallState } from '../../../call/voice-session'
import { iconSvg } from '../../icons'
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

function actionButton(
  label: string,
  iconName: Parameters<typeof iconSvg>[0],
  action: () => void,
  tone: 'teal' | 'ruby' | 'amber' = 'teal',
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `cw-call-card__action cw-call-card__action--${tone}`
  button.innerHTML = iconSvg(iconName)
  button.setAttribute('aria-label', label)
  button.title = label
  button.addEventListener('click', action)
  return button
}

function renderCard(state: VoiceCallState, session: VoiceCallSession): HTMLElement {
  const card = document.createElement('section')
  card.className = 'cw-call-card'
  card.dataset.phase = state.phase

  const top = document.createElement('div')
  top.className = 'cw-call-card__top'

  const status = document.createElement('div')
  status.className = 'cw-call-card__status'
  status.innerHTML = `${iconSvg('call')}<span>${callStatusText(state)}</span>`

  const context = document.createElement('span')
  context.className = 'cw-call-card__context'
  context.textContent = 'Hỗ trợ'
  top.append(status, context)

  if (state.phase === 'active') {
    const duration = document.createElement('span')
    duration.className = 'cw-call-card__duration'
    duration.textContent = formatCallDuration(Date.now() - (state.connectedAt ?? Date.now()))
    top.append(duration)
  }

  const main = document.createElement('div')
  main.className = 'cw-call-card__main'

  const avatar = document.createElement('div')
  avatar.className = 'cw-call-card__avatar'
  avatar.innerHTML = iconSvg('call')

  const identity = document.createElement('div')
  identity.className = 'cw-call-card__identity'
  const name = document.createElement('strong')
  name.textContent = state.peerName || 'Cuộc gọi thoại'
  const subtitle = document.createElement('span')
  subtitle.textContent = state.error || state.permissionNotice || 'Cuộc gọi thoại'
  identity.append(name, subtitle)

  const actions = document.createElement('div')
  actions.className = 'cw-call-card__actions'

  if (state.phase === 'error') {
    actions.append(actionButton('Đóng', 'close', () => session.dismissError(), 'ruby'))
  } else if (state.phase === 'incoming') {
    actions.append(
      actionButton('Nhận', 'acceptCall', () => { void session.accept() }, 'teal'),
      actionButton('Từ chối', 'endCall', () => { void session.decline() }, 'ruby'),
    )
  } else if (state.resumeRequired) {
    actions.append(
      actionButton('Tiếp tục', 'acceptCall', () => { void session.resumeFromUserGesture() }, 'teal'),
      actionButton('Kết thúc', 'endCall', () => { void session.hangup() }, 'ruby'),
    )
  } else {
    if (state.audioBlocked) {
      actions.append(actionButton('Bật âm thanh', 'speaker', () => session.startAudio(), 'amber'))
    }
    if (state.phase === 'active') {
      actions.append(actionButton(
        state.muted ? 'Mở mic' : 'Tắt mic',
        state.muted ? 'unmute' : 'mute',
        () => session.toggleMute(),
        state.muted ? 'amber' : 'teal',
      ))
    }
    actions.append(actionButton('Kết thúc', 'endCall', () => { void session.hangup() }, 'ruby'))
  }

  main.append(avatar, identity, actions)
  card.append(top, main)
  return card
}

export function mountChatwootCallUi(host: HTMLElement, session: VoiceCallSession): () => void {
  let clock = 0

  const render = (state: VoiceCallState = session.getState()): void => {
    host.replaceChildren()
    if (state.phase === 'idle') return

    const widget = document.createElement('div')
    widget.className = 'cw-call-widget'
    widget.append(renderCard(state, session))
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
