export type MatrixDiagnosis =
  | 'local-capture-silent'
  | 'transport-or-encode'
  | 'audio-alive'

export interface MatrixPathMetrics {
  localEnergy: number
  outboundBytes: number
  remoteEnergy: number
}

const LOCAL_ENERGY_FLOOR = 0.001
const REMOTE_ENERGY_FLOOR = 0.00001

export function diagnoseMatrixPath(metrics: MatrixPathMetrics): MatrixDiagnosis {
  if (metrics.localEnergy < LOCAL_ENERGY_FLOOR) return 'local-capture-silent'
  if (metrics.remoteEnergy < REMOTE_ENERGY_FLOOR) return 'transport-or-encode'
  return 'audio-alive'
}
