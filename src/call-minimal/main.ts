import { MatrixCallOwner, MATRIX_LIVEKIT_VERSION, MATRIX_ROOM_NAME } from './matrix-owner-v152.js'
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

function render(state: any): void {
  statusEl.textContent = state.status
  profileEl.textContent = state.current ?? '—'
  countdownEl.textContent = state.secondsLeft ? `${state.secondsLeft}s` : '—'
  runButton.disabled = Boolean(state.running)
  stopButton.disabled = !state.running
  resultsEl.innerHTML = ''
  for (const result of state.results ?? []) {
    const row = document.createElement('div')
    row.className = 'matrix-result'
    row.dataset.status = result.verdict
    const meterState = result.meterState ?? 'unknown'
    const trackState = result.track?.readyState ?? 'unknown'
    const trackOn = result.track?.enabled ? 'on' : 'off'
    row.innerHTML = `<b>${result.label}</b><span>${String(result.verdict).toUpperCase()}</span><code>mic ${Number(result.localEnergy).toFixed(4)} · meter ${meterState} · track ${trackState}/${trackOn} · ↑${result.outboundBytes} · ↓${result.inboundBytes} · energy ${Number(result.inboundEnergy).toFixed(6)}</code>`
    resultsEl.appendChild(row)
  }
}

const owner = new MatrixCallOwner(outputEl, render)
render({ running: false, status: 'Sẵn sàng chạy 4 kiểu', results: [] })
runButton.addEventListener('click', () => void owner.runAll())
stopButton.addEventListener('click', () => void owner.stop())
