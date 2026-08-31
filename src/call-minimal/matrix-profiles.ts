export type MatrixProfileId = 'webkit-reroute' | 'webkit-reset-reroute' | 'raw-mic-reroute'

export interface MatrixProfile {
  id: MatrixProfileId
  label: string
  seconds: number
  transport: 'livekit'
}

export const MATRIX_PROFILES: readonly MatrixProfile[] = [
  { id: 'webkit-reroute', label: 'WebKit Reroute', seconds: 10, transport: 'livekit' },
  { id: 'webkit-reset-reroute', label: 'WebKit Reset + Reroute', seconds: 10, transport: 'livekit' },
  { id: 'raw-mic-reroute', label: 'Raw Mic + Reroute', seconds: 10, transport: 'livekit' },
] as const

export function nextMatrixProfile(current: MatrixProfileId): MatrixProfile | undefined {
  const index = MATRIX_PROFILES.findIndex((profile) => profile.id === current)
  return index >= 0 ? MATRIX_PROFILES[index + 1] : undefined
}
