import type { VoiceCallSession, VoiceCallState } from '../../../call/voice-session'
import './call.css'

export interface MountedCleanCallUi { destroy(): void }

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'HT'
}

function statusText(state: VoiceCallState): string {
  if (state.phase === 'incoming') return 'Cuộc gọi đến'
  if (state.phase === 'outgoing') return 'Đang gọi…'
  if (state.phase === 'connecting') return 'Đang kết nối…'
  if (state.phase === 'reconnecting') return 'Đang kết nối lại…'
  if (state.phase === 'active') return 'Đang trong cuộc gọi'
  if (state.phase === 'error') return state.error || 'Lỗi cuộc gọi'
  return ''
}

export function mountCleanCallUi(host: HTMLElement, session: VoiceCallSession): MountedCleanCallUi {
  host.innerHTML = `
    <section class="clean-call" hidden>
      <button class="clean-call__minimize" type="button">Thu nhỏ</button>
      <div class="clean-call__card">
        <div class="clean-call__avatar"></div>
        <div><div class="clean-call__name"></div><div class="clean-call__status"></div></div>
        <div class="clean-call__controls">
          <button class="clean-call__button clean-call__mute" type="button" aria-label="Tắt/bật mic">🎙</button>
          <button class="clean-call__button clean-call__speaker" type="button" aria-label="Loa">🔊</button>
          <button class="clean-call__button clean-call__accept clean-call__button--accept" type="button" aria-label="Nhận cuộc gọi">✓</button>
          <button class="clean-call__button clean-call__end clean-call__button--end" type="button" aria-label="Kết thúc">✕</button>
        </div>
      </div>
    </section>
    <section class="clean-call-compact" hidden>
      <div class="clean-call-compact__avatar"></div>
      <div class="clean-call-compact__text"><strong></strong><span></span></div>
      <button class="clean-call-compact__open" type="button" aria-label="Mở cuộc gọi">↗</button>
      <button class="clean-call-compact__end" type="button" aria-label="Kết thúc">✕</button>
    </section>
  `
  const full = host.querySelector<HTMLElement>('.clean-call')!
  const compact = host.querySelector<HTMLElement>('.clean-call-compact')!
  const avatar = host.querySelector<HTMLElement>('.clean-call__avatar')!
  const name = host.querySelector<HTMLElement>('.clean-call__name')!
  const status = host.querySelector<HTMLElement>('.clean-call__status')!
  const compactAvatar = host.querySelector<HTMLElement>('.clean-call-compact__avatar')!
  const compactName = host.querySelector<HTMLElement>('.clean-call-compact__text strong')!
  const compactStatus = host.querySelector<HTMLElement>('.clean-call-compact__text span')!
  const accept = host.querySelector<HTMLButtonElement>('.clean-call__accept')!
  const end = host.querySelector<HTMLButtonElement>('.clean-call__end')!
  const compactEnd = host.querySelector<HTMLButtonElement>('.clean-call-compact__end')!
  const mute = host.querySelector<HTMLButtonElement>('.clean-call__mute')!
  const speaker = host.querySelector<HTMLButtonElement>('.clean-call__speaker')!
  const minimize = host.querySelector<HTMLButtonElement>('.clean-call__minimize')!
  const open = host.querySelector<HTMLButtonElement>('.clean-call-compact__open')!

  const render = (state: VoiceCallState) => {
    const idle = state.phase === 'idle'
    full.hidden = idle || state.display !== 'full'
    compact.hidden = idle || state.display !== 'compact'
    const peer = state.peerName || 'Hỗ trợ'
    avatar.textContent = initials(peer)
    name.textContent = peer
    status.textContent = statusText(state)
    compactAvatar.textContent = initials(peer)
    compactName.textContent = peer
    compactStatus.textContent = statusText(state)
    accept.hidden = state.phase !== 'incoming'
    mute.hidden = !['active', 'connecting', 'reconnecting'].includes(state.phase)
    speaker.hidden = !state.speakerAvailable && !session.hasPhoneSpeakerToggle()
    mute.classList.toggle('clean-call__button--active', state.muted)
    speaker.classList.toggle('clean-call__button--active', state.speakerSelected)
    minimize.hidden = state.phase === 'incoming'
  }

  minimize.addEventListener('click', () => session.setDisplay('compact'))
  open.addEventListener('click', () => session.setDisplay('full'))
  accept.addEventListener('click', () => { void session.accept() })
  end.addEventListener('click', () => { void session.hangup() })
  compactEnd.addEventListener('click', () => { void session.hangup() })
  mute.addEventListener('click', () => session.toggleMute())
  speaker.addEventListener('click', () => { void session.chooseSpeaker() })
  const unsubscribe = session.subscribe(render)
  return { destroy() { unsubscribe(); host.replaceChildren() } }
}
