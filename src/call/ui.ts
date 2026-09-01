import { defaultCallRouteForWeb } from './platform-audio-route'
import { formatCallDuration } from './presentation'
import { phoneSpeakerButtonPresentation } from './speaker-control-presentation'
import type { VoiceCallSession, VoiceCallState } from './voice-session'

export function mountVoiceCallUi(host: HTMLElement, session: VoiceCallSession): () => void {
  let clock = 0

  const render = (state: VoiceCallState = session.getState()): void => {
    host.replaceChildren()
    if (state.phase === 'idle') return

    if (state.phase === 'error') {
      const bar = document.createElement('button')
      bar.type = 'button'
      bar.className = 'voice-call-error'
      bar.textContent = 'Cuộc gọi lỗi · chạm để đóng'
      bar.addEventListener('click', () => session.dismissError())
      host.append(bar)
      return
    }

    if (state.display === 'hidden') {
      const restore = document.createElement('button')
      restore.type = 'button'
      restore.className = 'voice-call-hidden'
      restore.textContent = '☎'
      restore.title = 'Mở cuộc gọi'
      restore.addEventListener('click', () => session.setDisplay('full'))
      host.append(restore)
      return
    }

    if (state.display === 'compact') {
      host.append(renderTopBar(state, session))
      return
    }

    host.append(renderFull(state, session))
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

function statusText(state: VoiceCallState): string {
  if (state.phase === 'incoming') return 'Cuộc gọi đến'
  if (state.phase === 'outgoing') return 'Đang gọi…'
  if (state.phase === 'connecting') return 'Đang kết nối…'
  if (state.phase === 'active') return formatCallDuration(Date.now() - (state.connectedAt ?? Date.now()))
  return ''
}

function renderTopBar(state: VoiceCallState, session: VoiceCallSession): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'voice-call-topbar'

  const main = document.createElement('button')
  main.type = 'button'
  main.className = 'voice-call-topbar-main'
  main.innerHTML = `<strong>☎ ${escapeHtml(state.peerName || 'Cuộc gọi')}</strong><span>${statusText(state)}</span>`
  main.addEventListener('click', () => session.setDisplay('full'))

  if (state.audioBlocked) {
    bar.append(main, controlButton('Bật âm', '🔊', () => session.startAudio()))
  } else {
    bar.append(main)
  }

  const mute = controlButton(state.muted ? 'Mở mic' : 'Tắt mic', state.muted ? '🎙' : '🔇', () => session.toggleMute())
  const end = controlButton('Kết thúc', '✕', () => void session.hangup(), 'danger')
  bar.append(mute, end)
  return bar
}

function renderFull(state: VoiceCallState, session: VoiceCallSession): HTMLElement {
  const overlay = document.createElement('section')
  overlay.className = 'voice-call-full'

  const top = document.createElement('div')
  top.className = 'voice-call-full-top'
  const compact = controlButton('Thu nhỏ', '⌄', () => session.setDisplay('compact'))
  const hide = controlButton('Ẩn', '—', () => session.setDisplay('hidden'))
  top.append(compact, hide)

  const center = document.createElement('div')
  center.className = 'voice-call-full-center'
  const avatar = document.createElement('div')
  avatar.className = 'voice-call-avatar'
  avatar.textContent = '☎'
  const name = document.createElement('strong')
  name.textContent = state.peerName || 'Cuộc gọi thoại'
  const status = document.createElement('span')
  status.textContent = statusText(state)
  center.append(avatar, name, status)
  if (state.permissionNotice) {
    const permissionNotice = document.createElement('small')
    permissionNotice.className = 'voice-call-inline-notice'
    permissionNotice.textContent = state.permissionNotice
    center.append(permissionNotice)
  }
  if (state.error) {
    const notice = document.createElement('small')
    notice.className = 'voice-call-inline-error'
    notice.textContent = state.error
    center.append(notice)
  }

  const controls = document.createElement('div')
  controls.className = 'voice-call-controls'

  if (state.phase === 'incoming') {
    controls.append(
      controlButton('Từ chối', '✕', () => void session.decline(), 'danger'),
      controlButton('Nhận', '☎', () => void session.accept(), 'accept'),
    )
  } else {
    if (state.audioBlocked) {
      controls.append(controlButton('Bật âm thanh', '🔊', () => session.startAudio(), 'accept'))
    }

    const phoneToggle = session.hasPhoneSpeakerToggle()
    const androidWebSpeaker = defaultCallRouteForWeb(navigator.userAgent) === 'speaker' && !phoneToggle
    const phonePresentation = phoneSpeakerButtonPresentation(state.speakerSelected)
    const speakerLabel = androidWebSpeaker
      ? 'Loa ngoài'
      : phoneToggle
        ? phonePresentation.label
        : state.speakerSelected ? 'Đầu ra đã chọn' : state.speakerAvailable ? 'Chọn loa' : 'Loa hệ thống'
    const speakerIcon = phoneToggle ? phonePresentation.icon : '🔊'
    const speaker = controlButton(speakerLabel, speakerIcon, () => void session.chooseSpeaker(), phoneToggle && phonePresentation.pressed ? 'is-active' : '')
    speaker.disabled = androidWebSpeaker || !state.speakerAvailable
    speaker.title = androidWebSpeaker
      ? 'Chrome Android dùng speakerphone mặc định và không cho web đổi trực tiếp sang loa thoại'
      : phoneToggle
        ? phonePresentation.title
        : state.speakerAvailable ? 'Chạm để chọn đầu ra âm thanh' : 'Trình duyệt không hỗ trợ đổi loa trực tiếp'
    if (phoneToggle) speaker.setAttribute('aria-pressed', String(phonePresentation.pressed))

    controls.append(
      speaker,
      controlButton(state.muted ? 'Mở mic' : 'Tắt tiếng', state.muted ? '🎙' : '🔇', () => session.toggleMute()),
      controlButton('Kết thúc', '☎', () => void session.hangup(), 'danger'),
    )
  }

  overlay.append(top, center, controls)
  return overlay
}

function controlButton(label: string, icon: string, action: () => void, kind = ''): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `voice-call-control ${kind}`.trim()
  button.innerHTML = `<span>${icon}</span><small>${escapeHtml(label)}</small>`
  button.addEventListener('click', action)
  return button
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
