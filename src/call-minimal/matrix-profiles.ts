export type MatrixProfileId = 'native-livekit' | 'native-p2p' | 'webaudio-bridge' | 'livekit-precapture'

export interface MatrixProfile {
  id: MatrixProfileId
  label: string
  seconds: number
  transport: 'livekit' | 'p2p'
}

export const MATRIX_PROFILES: readonly MatrixProfile[] = [
  { id: 'native-livekit', label: 'Native → LiveKit', seconds: 12, transport: 'livekit' },
  { id: 'native-p2p', label: 'Native P2P', seconds: 12, transport: 'p2p' },
  { id: 'webaudio-bridge', label: 'WebAudio Bridge', seconds: 12, transport: 'livekit' },
  { id: 'livekit-precapture', label: 'LiveKit Pre-capture', seconds: 12, transport: 'livekit' },
] as const

export function nextMatrixProfile(current: MatrixProfileId): MatrixProfile | undefined {
  const index = MATRIX_PROFILES.findIndex((profile) => profile.id === current)
  return index >= 0 ? MATRIX_PROFILES[index + 1] : undefined
}
