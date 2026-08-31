import { MatrixCallOwner, MATRIX_LIVEKIT_VERSION, MATRIX_ROOM_NAME, type MatrixState } from './matrix-owner'
import { MINIMAL_CALL_TEST_VERSION, minimalCallVersionLabel } from './version-label'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}

const runButton = required<HTMLButtonElement>('#run-all')
const stopButton = required<HTMLButtonElement>('#stop')
const statusEl = required<HTMLElement>('#status')
const profileEl = required<HTMLElement>('#current-profile')
const countdownEl = required<HTMLElement>('#countdown')
const resultsEl = required<HTMLElement>('#matrix-results')
const roomEl = required<HTMLElement>('#room')
const versionEl = required<HTMLElement>('#livekit-version')
const appVersionEl = required<HTMLElement>('#app-version')
const outputEl = required<HTMLAudioElement>('#remote-audio')

roomEl.textContent = MATRIX_ROOM_NAME
versionEl.textContent = MATRIX_LIVEKIT_VERSION
appVersionEl.textContent = minimalCallVersionLabel(MINIMAL_CALL_TEST_VERSION, import.meta.env.VITE_BUILD_ID ?? '')
appVersionEl.title = MINIMAL_CALL_TEST_VERSION

function render(state: MatrixState): void {
  statusEl.textContent = state.status
  profileEl.textContent = state.current ?? '—'
  countdownEl.textContent = state.secondsLeft ? `${state.secondsLeft}s` : '—'
  runButton.disabled = state.running
  stopButton.disabled = !state.running

  resultsEl.innerHTML = ''
  for (const result of state.results) {
    const row = document.createElement('div')
    row.className = 'matrix-result'
    row.dataset.status = result.verdict
    row.innerHTML = `<b>${result.label}</b><span>${result.verdict.toUpperCase()}</span><code>mic ${result.localEnergy.toFixed(4)} · ↑${result.outboundBytes} · ↓${result.inboundBytes} · energy ${result.inboundEnergy.toFixed(6)}</code>`
    resultsEl.appendChild(row)
  }
}

const owner = new MatrixCallOwner(outputEl, render)
render({ running: false, status: 'Sẵn sàng chạy 4 kiểu', results: [] })

runButton.addEventListener('click', () => void owner.runAll())
stopButton.addEventListener('click', () => void owner.stop())
