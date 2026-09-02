import { defaultCallRouteForWeb } from '../../../call/platform-audio-route'
import { formatCallDuration } from '../../../call/presentation'
import { phoneSpeakerButtonPresentation } from '../../../call/speaker-control-presentation'
import type { VoiceCallSession, VoiceCallState } from '../../../call/voice-session'
import { iconSvg } from '../../icons'
import './call-widget.css'

export interface ChatwootCallUiView {
  destroy(): void
}

export function callStatusText(state: VoiceCallState): string {
  if (state.resumeRequired) return 'Chạm để tiếp tục cuộc gọi'
  if (state.phase === 'incoming') return 'Cuộc gọi đến'
  if (state.phase === 'outgoing') return 'Đang gọi…'
  if (state.phase === 'connecting') return 'Đang kết nối…'
  if (state.phase === 'reconnecting') return 'Đang nối lại…'
  if (state.phase === 'active') return formatCallDuration(Date.now() - (state.connectedAt ?? Date.now()))
  if (state.phase === 'error') return 'Cuộc gọi lỗi'
  return ''
}

function iconButton(
  label: string,
  icon: string,
  action: () => void,
  tone: 'neutral' | 'accept' | 'danger' = 'neutral',
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `cw-call-card__action cw-call-card__action--${tone}`
  const iconHost = document.createElement('span')
  iconHost.className = 'cw-call-card__action-icon'
  iconHost.innerHTML = iconSvg(icon as Parameters<typeof iconSvg>[0])
  const caption = document.createElement('small')
  caption.textContent = label
  button.append(iconHost, caption)
  button.setAttribute('aria-label', label)
  button.addEventListener('click', action)
  return button
}

function identity(state: VoiceCallState): HTMLElement {
  const block = document.createElement('div')
  block.className = 'cw-call-card__identity'

  const avatar = document.createElement('div')
  avatar.className = 'cw-call-card__avatar'
  avatar.innerHTML = iconSvg('call')

  const name = document.createElement('strong')
  name.className = 'cw-call-card__name'
  name.textContent = state.peerName || 'Cuộc gọi thoại'

  const status = document.createElement('span')
  status.className = 'cw-call-card__status'
  status.textContent = callStatusText(state)

  block.append(avatar, name, status)

  if (state.permissionNotice) {
    const notice = document.createElement('small')
    notice.className = 'cw-call-card__notice'
    notice.textContent = state.permissionNotice
    block.append(notice)
  }

  if (state.error) {
    const error = document.createElement('small')
    error.className = 'cw-call-card__error'
    error.textContent = state.error
    block.append(error)
  }

  return block
}

function appendActiveControls(actions: HTMLElement, state: VoiceCallState, session: VoiceCallSession): void {
  if (state.audioBlocked) {
    actions.append(iconButton('Bật âm thanh', 'speaker', () => session.startAudio(), 'accept'))
  }

  if (state.phase === 'active') {
    const phoneToggle = session.hasPhoneSpeakerToggle()
    const androidWebSpeaker = defaultCallRouteForWeb(navigator.userAgent) === 'speaker' && !phoneToggle
    const phonePresentation = phoneSpeakerButtonPresentation(state.speakerSelected)
    const label = androidWebSpeaker
      ? 'Loa ngoài'
      : phoneToggle
        ? phonePresentation.label
        : state.speakerSelected
          ? 'Đầu ra đã chọn'
          : state.speakerAvailable
            ? 'Chọn loa'
            : 'Loa hệ thống'

    const speaker = iconButton(label, 'speaker', () => { void session.chooseSpeaker() })
    speaker.disabled = androidWebSpeaker || !state.speakerAvailable
    speaker.title = androidWebSpeaker
      ? 'Chrome Android dùng speakerphone mặc định và không cho web đổi trực tiếp sang loa thoại'
      : phoneToggle
        ? phonePresentation.title
        : state.speakerAvailable
          ? 'Chạm để chọn đầu ra âm thanh'
          : 'Trình duyệt không hỗ trợ đổi loa trực tiếp'
    if (phoneToggle) speaker.setAttribute('aria-pressed', String(phonePresentation.pressed))
    actions.append(speaker)
  }

  const mute = iconButton(
    state.muted ? 'Mở mic' : 'Tắt tiếng',
    state.muted ? 'unmute' : 'mute',
    () => session.toggleMute(),
  )
  if (state.muted) mute.classList.add('is-active')
  actions.append(mute, iconButton('Kết thúc', 'endCall', () => { void session.hangup() }, 'danger'))
}

function fullCallCard(state: VoiceCallState, session: VoiceCallSession): HTMLElement {
  const layer = document.createElement('section')
  layer.className = 'cw-call-layer'
  layer.setAttribute('aria-label', 'Cuộc gọi')

  const card = document.createElement('div')
  card.className = 'cw-call-card cw-call-card--full'

  const top = document.createElement('header')
  top.className = 'cw-call-card__top'
  if (state.phase !== 'error') {
    const minimize = document.createElement('button')
    minimize.type = 'button'
    minimize.className = 'cw-call-card__minimize'
    minimize.innerHTML = `${iconSvg('minimize')}<span>Thu nhỏ</span>`
    minimize.setAttribute('aria-label', 'Thu nhỏ cuộc gọi')
    minimize.addEventListener('click', () => session.setDisplay('compact'))
    top.append(minimize)
  }

  const actions = document.createElement('div')
  actions.className = 'cw-call-card__actions'

  if (state.phase === 'error') {
    actions.append(iconButton('Đóng', 'close', () => session.dismissError(), 'danger'))
  } else if (state.phase === 'incoming') {
    actions.append(
      iconButton('Từ chối', 'endCall', () => { void session.decline() }, 'danger'),
      iconButton('Nhận', 'acceptCall', () => { void session.accept() }, 'accept'),
    )
  } else if (state.resumeRequired) {
    actions.append(
      iconButton('Tiếp tục', 'acceptCall', () => { void session.resumeFromUserGesture() }, 'accept'),
      iconButton('Kết thúc', 'endCall', () => { void session.hangup() }, 'danger'),
    )
  } else {
    appendActiveControls(actions, state, session)
  }

  card.append(top, identity(state), actions)
  layer.append(card)
  return layer
}

function compactCallCard(state: VoiceCallState, session: VoiceCallSession): HTMLElement {
  const card = document.createElement('section')
  card.className = 'cw-call-card cw-call-card--compact'

  const main = document.createElement('button')
  main.type = 'button'
  main.className = 'cw-call-card__compact-main'
  const callIcon = document.createElement('span')
  callIcon.className = 'cw-call-card__compact-icon'
  callIcon.innerHTML = iconSvg('call')
  const copy = document.createElement('span')
  copy.className = 'cw-call-card__compact-copy'
  const name = document.createElement('strong')
  name.textContent = state.peerName || 'Cuộc gọi'
  const status = document.createElement('small')
  status.className = 'cw-call-card__status'
  status.textContent = callStatusText(state)
  copy.append(name, status)
  main.append(callIcon, copy)
  main.setAttribute('aria-label', 'Mở cuộc gọi')
  main.addEventListener('click', () => session.setDisplay('full'))
  card.append(main)

  const actions = document.createElement('div')
  actions.className = 'cw-call-card__actions cw-call-card__actions--compact'
  if (state.phase === 'error') {
    actions.append(iconButton('Đóng', 'close', () => session.dismissError(), 'danger'))
  } else if (state.phase === 'incoming') {
    actions.append(
      iconButton('Từ chối', 'endCall', () => { void session.decline() }, 'danger'),
      iconButton('Nhận', 'acceptCall', () => { void session.accept() }, 'accept'),
    )
  } else if (state.resumeRequired) {
    actions.append(
      iconButton('Tiếp tục', 'acceptCall', () => { void session.resumeFromUserGesture() }, 'accept'),
      iconButton('Kết thúc', 'endCall', () => { void session.hangup() }, 'danger'),
    )
  } else {
    const mute = iconButton(
      state.muted ? 'Mở mic' : 'Tắt mic',
      state.muted ? 'unmute' : 'mute',
      () => session.toggleMute(),
    )
    if (state.muted) mute.classList.add('is-active')
    actions.append(mute, iconButton('Kết thúc', 'endCall', () => { void session.hangup() }, 'danger'))
  }
  card.append(actions)
  return card
}

export function mountChatwootCallUi(host: HTMLElement, session: VoiceCallSession): () => void {
  let clock = 0

  const render = (state: VoiceCallState = session.getState()): void => {
    host.replaceChildren()
    if (state.phase === 'idle') return

    // Hidden remains an internal/recovery state only. Product presentation restores it as the compact pill.
    const compact = state.display === 'compact' || state.display === 'hidden'
    host.append(compact ? compactCallCard(state, session) : fullCallCard(state, session))
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
