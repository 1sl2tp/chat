import { MinimalCallOwner, MINIMAL_CALL_LIVEKIT_VERSION, MINIMAL_CALL_ROOM_NAME, type MinimalCallViewState } from './owner'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}

const joinButton = required<HTMLButtonElement>('#join')
const muteButton = required<HTMLButtonElement>('#mute')
const leaveButton = required<HTMLButtonElement>('#leave')
const statusEl = required<HTMLElement>('#status')
const remoteEl = required<HTMLElement>('#remote-count')
const mediaEl = required<HTMLElement>('#media-state')
const resultEl = required<HTMLElement>('#result')
const roomEl = required<HTMLElement>('#room')
const versionEl = required<HTMLElement>('#livekit-version')
const outputEl = required<HTMLAudioElement>('#remote-audio')

roomEl.textContent = MINIMAL_CALL_ROOM_NAME
versionEl.textContent = MINIMAL_CALL_LIVEKIT_VERSION

function render(state: MinimalCallViewState): void {
  statusEl.textContent = state.status
  remoteEl.textContent = String(state.remoteParticipants)
  mediaEl.textContent = `mic=${state.muted ? 'muted' : state.phase === 'connected' ? 'on' : 'off'} · remote=${state.remoteAudioSubscribed ? 'subscribed' : 'waiting'} · playback=${state.playbackStarted ? 'playing' : 'waiting'}`

  const active = state.phase === 'joining' || state.phase === 'connected' || state.phase === 'leaving'
  joinButton.disabled = active
  muteButton.disabled = state.phase !== 'connected'
  leaveButton.disabled = state.phase !== 'connected' && state.phase !== 'joining'
  muteButton.textContent = state.muted ? 'Bật mic' : 'Tắt mic'

  if (state.summary) {
    resultEl.hidden = false
    resultEl.textContent = `${state.summary.overallStatus.toUpperCase()} · mic ${state.summary.microphone} · remote ${state.summary.remoteAudio} · playback ${state.summary.playback}${state.runId ? ` · log ${state.runId}` : ''}`
    resultEl.dataset.status = state.summary.overallStatus
  } else if (state.phase === 'error') {
    resultEl.hidden = false
    resultEl.textContent = state.runId ? `ERROR · log ${state.runId}` : 'ERROR'
    resultEl.dataset.status = 'error'
  }
}

const owner = new MinimalCallOwner(outputEl, render)
render({
  phase: 'idle',
  status: 'Chưa vào phòng',
  muted: false,
  remoteParticipants: 0,
  remoteAudioSubscribed: false,
  playbackStarted: false,
})

joinButton.addEventListener('click', () => {
  resultEl.hidden = true
  void owner.join().catch(() => {})
})

muteButton.addEventListener('click', () => {
  void owner.toggleMute().catch((error) => {
    statusEl.textContent = `Lỗi mic: ${error instanceof Error ? error.message : String(error)}`
  })
})

leaveButton.addEventListener('click', () => {
  void owner.leave('user')
})
