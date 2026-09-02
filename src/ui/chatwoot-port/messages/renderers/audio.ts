import type { PresentedMessage } from '../message-model'
import { createMediaActions } from './media-actions'

function formatSeconds(value: number): string {
  const total = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function renderAudioMessage(message: PresentedMessage): HTMLElement {
  const row = document.createElement('article')
  row.className = `cw-message cw-message--audio cw-message--${message.direction}`
  row.dataset.messageId = message.id

  const player = document.createElement('div')
  player.className = 'cw-audio-player'
  player.dataset.audioMessageId = message.id

  const audio = document.createElement('audio')
  audio.className = 'cw-audio-player__media'
  audio.src = message.attachment?.url ?? ''
  audio.preload = 'metadata'

  const playButton = document.createElement('button')
  playButton.className = 'cw-audio-player__play'
  playButton.type = 'button'
  playButton.textContent = '▶'
  playButton.ariaLabel = 'Phát ghi âm'

  const body = document.createElement('div')
  body.className = 'cw-audio-player__body'

  const label = document.createElement('span')
  label.className = 'cw-audio-player__label'
  label.textContent = 'Ghi âm'

  const range = document.createElement('input')
  range.className = 'cw-audio-player__range'
  range.type = 'range'
  range.min = '0'
  range.max = '1000'
  range.step = '1'
  range.value = '0'
  range.ariaLabel = 'Tiến trình ghi âm'

  const time = document.createElement('span')
  time.className = 'cw-audio-player__time'
  time.textContent = '0:00'

  const sync = () => {
    const duration = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0
    const current = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0
    range.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0'
    time.textContent = duration > 0
      ? `${formatSeconds(current)} / ${formatSeconds(duration)}`
      : formatSeconds(current)
    playButton.textContent = audio.paused ? '▶' : '❚❚'
    playButton.ariaLabel = audio.paused ? 'Phát ghi âm' : 'Tạm dừng ghi âm'
  }

  playButton.addEventListener('click', () => {
    if (audio.paused) void audio.play().catch(() => {})
    else audio.pause()
  })
  range.addEventListener('input', () => {
    const duration = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0
    if (duration <= 0) return
    audio.currentTime = (Number(range.value) / 1000) * duration
    sync()
  })
  audio.addEventListener('loadedmetadata', sync)
  audio.addEventListener('timeupdate', sync)
  audio.addEventListener('play', sync)
  audio.addEventListener('pause', sync)
  audio.addEventListener('ended', sync)

  body.append(label, range)
  player.append(
    audio,
    playButton,
    body,
    time,
    createMediaActions({ url: message.attachment?.url ?? '' }),
  )
  row.append(player)
  return row
}
