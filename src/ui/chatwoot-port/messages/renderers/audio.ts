import type { PresentedMessage } from '../message-model'

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

  const label = document.createElement('span')
  label.className = 'cw-audio-player__label'
  label.textContent = message.attachment?.name ?? 'Ghi âm'

  player.append(audio, label)
  row.append(player)
  return row
}
