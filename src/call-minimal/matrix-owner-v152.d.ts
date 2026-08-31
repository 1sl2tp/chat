export interface MatrixResult {
  id: string
  label: string
  localEnergy: number
  outboundBytes: number
  inboundBytes: number
  inboundEnergy: number
  meterState: string
  track: {
    readyState: string
    enabled: boolean
    muted: boolean
    settings: MediaTrackSettings | null
  }
  profileError: string | null
  verdict: 'pass' | 'fail' | 'inconclusive'
}

export interface MatrixState {
  running: boolean
  status: string
  current?: string
  secondsLeft?: number
  results: MatrixResult[]
}

export class MatrixCallOwner {
  constructor(output: HTMLAudioElement, onState: (state: MatrixState) => void)
  runAll(): Promise<void>
  stop(): Promise<void>
}

export const MATRIX_ROOM_NAME: string
export const MATRIX_LIVEKIT_VERSION: string
