import { MatrixRunner, type MatrixProfileResult, type MatrixViewState } from './matrix-runner'
import { MATRIX_PROFILE_IDS, matrixProfileLabel } from './matrix-profiles'
import { MINIMAL_CALL_TEST_VERSION, minimalCallVersionLabel } from './version-label'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}

const startButton = required<HTMLButtonElement>('#run-all')
const statusEl = required<HTMLElement>('#status')
const peerEl = required<HTMLElement>('#peer-state')
const profilesEl = required<HTMLElement>('#profiles')
const roomEl = required<HTMLElement>('#room')
const versionEl = required<HTMLElement>('#livekit-version')
const appVersionEl = required<HTMLElement>('#app-version')
const outputEl = required<HTMLAudioElement>('#remote-audio')

roomEl.textContent = 'matrix-v15-control'
versionEl.textContent = '2.22.1'
appVersionEl.textContent = minimalCallVersionLabel(MINIMAL_CALL_TEST_VERSION, import.meta.env.VITE_BUILD_ID ?? '')
appVersionEl.title = MINIMAL_CALL_TEST_VERSION

profilesEl.innerHTML = MATRIX_PROFILE_IDS.map((profile, index) => `
  <article class="profile-card" data-profile="${profile}" data-state="waiting">
    <div class="profile-head">
      <span class="profile-index">${index + 1}</span>
      <strong>${matrixProfileLabel(profile)}</strong>
      <span class="profile-state">CHỜ</span>
    </div>
    <div class="profile-metrics">local — · send — · remote —</div>
  </article>
`).join('')

function diagnosisText(result: MatrixProfileResult): string {
  if (result.status === 'error') return result.note ? `ERROR · ${result.note}` : 'ERROR'
  if (result.diagnosis === 'audio-alive') return 'AUDIO OK'
  if (result.diagnosis === 'local-capture-silent') return 'MIC LOCAL IM'
  return 'LOCAL CÓ TIẾNG · SAU KHI GỬI IM'
}

function renderResult(result: MatrixProfileResult): void {
  const card = profilesEl.querySelector<HTMLElement>(`[data-profile="${result.profile}"]`)
  if (!card) return
  card.dataset.state = result.status
  const state = card.querySelector<HTMLElement>('.profile-state')
  const metrics = card.querySelector<HTMLElement>('.profile-metrics')
  if (state) state.textContent = diagnosisText(result)
  if (metrics) {
    const sent = result.sentEnergy === undefined ? '' : ` · bridge ${result.sentEnergy.toExponential(2)}`
    metrics.textContent = `local ${result.localEnergy.toExponential(2)}${sent} · send ${Math.round(result.outboundBytes / 1024)} KB · remote ${result.remoteEnergy.toExponential(2)}`
  }
}

function render(state: MatrixViewState): void {
  statusEl.textContent = state.status
  peerEl.textContent = state.peerConnected ? 'Máy bên kia: đã nối' : 'Máy bên kia: đang chờ'
  peerEl.dataset.connected = state.peerConnected ? 'true' : 'false'

  for (const profile of MATRIX_PROFILE_IDS) {
    const card = profilesEl.querySelector<HTMLElement>(`[data-profile="${profile}"]`)
    if (!card) continue
    const stateEl = card.querySelector<HTMLElement>('.profile-state')
    if (state.currentProfile === profile && !state.results.some((item) => item.profile === profile)) {
      card.dataset.state = 'running'
      if (stateEl) stateEl.textContent = 'ĐANG CHẠY'
    } else if (!state.results.some((item) => item.profile === profile) && state.phase !== 'done') {
      card.dataset.state = 'waiting'
      if (stateEl) stateEl.textContent = 'CHỜ'
    }
  }

  state.results.forEach(renderResult)

  const active = state.phase === 'connecting' || state.phase === 'waiting-peer' || state.phase === 'armed' || state.phase === 'running'
  startButton.disabled = active
  startButton.textContent = state.phase === 'done' || state.phase === 'error' ? 'Chạy lại tất cả' : 'Chạy tất cả'
}

const runner = new MatrixRunner(outputEl, render)

startButton.addEventListener('click', () => {
  for (const card of Array.from(profilesEl.querySelectorAll<HTMLElement>('.profile-card'))) {
    card.dataset.state = 'waiting'
    const state = card.querySelector<HTMLElement>('.profile-state')
    const metrics = card.querySelector<HTMLElement>('.profile-metrics')
    if (state) state.textContent = 'CHỜ'
    if (metrics) metrics.textContent = 'local — · send — · remote —'
  }
  void runner.startAll()
})
