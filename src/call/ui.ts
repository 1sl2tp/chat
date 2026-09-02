import { iconSvg } from '../ui/icons'
import { defaultCallRouteForWeb } from './platform-audio-route'
import { formatCallDuration } from './presentation'
import { phoneSpeakerButtonPresentation } from './speaker-control-presentation'
import type { VoiceCallSession, VoiceCallState } from './voice-session'

export function mountVoiceCallUi(host: HTMLElement, session: VoiceCallSession): () => void {
  let clock = 0

  const render = (state: VoiceCallState = session.getState()): void => {
    host.replaceChildren()
    if (state.phase === 'idle') return

    if (state.phase === 'error' && state.display !== 'full') {
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
      restore.innerHTML = iconSvg('call')
      restore.setAttribute('aria-label', 'Mở cuộc gọi')
      restore.title = 'Mở cuộc gọi'
      restore.addEventListener('click', () => session.setDisplay('full'))
      host.append(restore)
      return
    }

    if (state.display === 'compact') {
      host.append(renderCallPill(state, session))
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

export function statusText(state: VoiceCallState): string {
  if (state.resumeRequired) return 'Chạm để tiếp tục cuộc gọi'
  if (state.phase === 'incoming') return 'Cuộc gọi đến'
  if (state.phase === 'outgoing') return 'Đang gọi…'
  if (state.phase === 'connecting') return 'Đang kết nối…'
  if (state.phase === 'reconnecting') return 'Đang nối lại…'
  if (state.phase === 'active') return formatCallDuration(Date.now() - (state.connectedAt ?? Date.now()))
  if (state.phase === 'error') return 'Cuộc gọi lỗi'
  return ''
}

function renderCallPill(state: VoiceCallState, session: VoiceCallSession): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'voice-call-pill'

  const main = document.createElement('button')
  main.type = 'button'
  main.className = 'voice-call-pill-main'
  main.innerHTML = `${iconSvg('call')}<span class="voice-call-pill-copy"><strong>${escapeHtml(state.peerName || 'Cuộc gọi')}</strong><small>${escapeHtml(statusText(state))}</small></span>`
  main.setAttribute('aria-label', 'Mở cuộc gọi')
  main.addEventListener('click', () => session.setDisplay('full'))
  bar.append(main)

  if (state.resumeRequired) {
    const resume = controlButton('Tiếp tục', iconSvg('acceptCall'), () => void session.resumeFromUserGesture(), 'accept')
    const end = controlButton('Kết thúc', iconSvg('endCall'), () => void session.hangup(), 'danger')
    bar.append(resume, end)
    return bar
  }

  if (state.audioBlocked) {
    bar.append(controlButton('Bật âm', iconSvg('speaker'), () => session.startAudio(), 'accept'))
  }

  const mute = controlButton(
    state.muted ? 'Mở mic' : 'Tắt mic',
    state.muted ? iconSvg('unmute') : iconSvg('mute'),
    () => session.toggleMute(),
    state.muted ? 'is-active' : '',
  )
  const end = controlButton('Kết thúc', iconSvg('endCall'), () => void session.hangup(), 'danger')
  bar.append(mute, end)
  return bar
}

function renderFull(state: VoiceCallState, session: VoiceCallSession): HTMLElement {
  const overlay = document.createElement('section')
  overlay.className = 'voice-call-full'

  const top = document.createElement('div')
  top.className = 'voice-call-full-top'
  if (state.phase !== 'error') {
    const compact = controlButton('Thu nhỏ', iconSvg('minimize'), () => session.setDisplay('compact'))
    top.append(compact)
  }

  const center = document.createElement('div')
  center.className = 'voice-call-full-center'
  const avatar = document.createElement('div')
  avatar.className = 'voice-call-avatar'
  avatar.innerHTML = iconSvg('call')
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

  if (state.phase === 'error') {
    controls.append(controlButton('Đóng', iconSvg('close'), () => session.dismissError(), 'danger'))
  } else if (state.phase === 'incoming') {
    controls.append(
      controlButton('Từ chối', iconSvg('endCall'), () => void session.decline(), 'danger'),
      controlButton('Nhận', iconSvg('acceptCall'), () => void session.accept(), 'accept'),
    )
  } else if (state.resumeRequired) {
    controls.append(
      controlButton('Tiếp tục', iconSvg('acceptCall'), () => void session.resumeFromUserGesture(), 'accept'),
      controlButton('Kết thúc', iconSvg('endCall'), () => void session.hangup(), 'danger'),
    )
  } else {
    if (state.audioBlocked) {
      controls.append(controlButton('Bật âm thanh', iconSvg('speaker'), () => session.startAudio(), 'accept'))
    }

    if (state.phase === 'active') {
      const phoneToggle = session.hasPhoneSpeakerToggle()
      const androidWebSpeaker = defaultCallRouteForWeb(navigator.userAgent) === 'speaker' && !phoneToggle
      const phonePresentation = phoneSpeakerButtonPresentation(state.speakerSelected)
      const speakerLabel = androidWebSpeaker
        ? 'Loa ngoài'
        : phoneToggle
          ? phonePresentation.label
          : state.speakerSelected ? 'Đầu ra đã chọn' : state.speakerAvailable ? 'Chọn loa' : 'Loa hệ thống'
      const speaker = controlButton(
        speakerLabel,
        iconSvg('speaker'),
        () => void session.chooseSpeaker(),
        phoneToggle && phonePresentation.pressed ? 'is-active' : '',
      )
      speaker.disabled = androidWebSpeaker || !state.speakerAvailable
      speaker.title = androidWebSpeaker
        ? 'Chrome Android dùng speakerphone mặc định và không cho web đổi trực tiếp sang loa thoại'
        : phoneToggle
          ? phonePresentation.title
          : state.speakerAvailable ? 'Chạm để chọn đầu ra âm thanh' : 'Trình duyệt không hỗ trợ đổi loa trực tiếp'
      if (phoneToggle) speaker.setAttribute('aria-pressed', String(phonePresentation.pressed))
      controls.append(speaker)
    }

    controls.append(
      controlButton(
        state.muted ? 'Mở mic' : 'Tắt tiếng',
        state.muted ? iconSvg('unmute') : iconSvg('mute'),
        () => session.toggleMute(),
        state.muted ? 'is-active' : '',
      ),
      controlButton('Kết thúc', iconSvg('endCall'), () => void session.hangup(), 'danger'),
    )
  }

  overlay.append(top, center, controls)
  return overlay
}

function controlButton(label: string, iconMarkup: string, action: () => void, kind = ''): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `voice-call-control ${kind}`.trim()
  button.innerHTML = `<span>${iconMarkup}</span><small>${escapeHtml(label)}</small>`
  button.setAttribute('aria-label', label)
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
