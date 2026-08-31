export type CallMediaKind = 'audio' | 'video'
export type CallCompactMode = 'top' | 'pip'

export function compactModeFor(kind: CallMediaKind): CallCompactMode {
  return kind === 'video' ? 'pip' : 'top'
}

export function formatCallDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
