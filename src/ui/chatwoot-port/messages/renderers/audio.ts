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
  time.textContent = '…'

  let recoveredDuration = Number.isFinite(message.durationSeconds)
    ? Math.max(0, message.durationSeconds ?? 0)
    : 0
  let recoveringDuration = false
  let recoveryReturnTime = 0

  const getDuration = () => {
    const mediaDuration = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0
    return mediaDuration > 0 ? mediaDuration : recoveredDuration
  }

  const sync = () => {
    const duration = getDuration()
    const mediaCurrent = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0
    const current = recoveringDuration ? recoveryReturnTime : mediaCurrent
    range.value = duration > 0 ? String(Math.round((Math.min(current, duration) / duration) * 1000)) : '0'
    time.textContent = duration > 0
      ? `${formatSeconds(Math.min(current, duration))} / ${formatSeconds(duration)}`
      : '…'
    playButton.textContent = audio.paused ? '▶' : '❚❚'
    playButton.ariaLabel = audio.paused ? 'Phát ghi âm' : 'Tạm dừng ghi âm'
  }

  const finishDurationRecovery = () => {
    const mediaDuration = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0
    if (mediaDuration > 0) recoveredDuration = mediaDuration

    if (recoveringDuration && recoveredDuration <= 0) {
      const probedDuration = Number.isFinite(audio.currentTime)
        && audio.currentTime > 0
        && audio.currentTime < 1e100
        ? audio.currentTime
        : 0
      if (probedDuration > 0) recoveredDuration = probedDuration
    }

    if (recoveringDuration && recoveredDuration > 0) {
      recoveringDuration = false
      audio.currentTime = Math.min(recoveryReturnTime, recoveredDuration)
    }
    sync()
  }

  const recoverUnknownDuration = () => {
    if (getDuration() > 0 || recoveringDuration || !audio.src) {
      sync()
      return
    }
    recoveryReturnTime = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0
    recoveringDuration = true
    try {
      // MediaRecorder WebM can expose duration as Infinity until the browser seeks to the end once.
      audio.currentTime = 1e101
    } catch {
      recoveringDuration = false
      sync()
    }
  }

  playButton.addEventListener('click', () => {
    if (audio.paused) void audio.play().catch(() => {})
    else audio.pause()
  })
  range.addEventListener('input', () => {
    const duration = getDuration()
    if (duration <= 0) return
    audio.currentTime = (Number(range.value) / 1000) * duration
    sync()
  })
  audio.addEventListener('loadedmetadata', () => {
    if (getDuration() > 0) finishDurationRecovery()
    else recoverUnknownDuration()
  })
  audio.addEventListener('durationchange', finishDurationRecovery)
  audio.addEventListener('timeupdate', () => {
    if (recoveringDuration) finishDurationRecovery()
    else sync()
  })
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
