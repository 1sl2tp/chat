export const MATRIX_PROFILE_IDS = [
  'native-livekit',
  'native-p2p',
  'webaudio-bridge',
  'livekit-precapture',
] as const

export type MatrixProfileId = (typeof MATRIX_PROFILE_IDS)[number]

const LABELS: Record<MatrixProfileId, string> = {
  'native-livekit': 'Native → LiveKit',
  'native-p2p': 'Native P2P',
  'webaudio-bridge': 'WebAudio Bridge',
  'livekit-precapture': 'LiveKit Pre-capture',
}

export function matrixProfileLabel(profile: MatrixProfileId): string {
  return LABELS[profile]
}

export function nextMatrixProfileAt(
  startAt: number,
  index: number,
  profileDurationMs: number,
  cleanupGapMs: number,
): number {
  return startAt + index * (profileDurationMs + cleanupGapMs)
}
