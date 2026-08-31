export type MatrixVerdict = 'pass' | 'fail' | 'inconclusive'

export interface MatrixVerdictMetrics {
  localEnergy: number
  outboundBytes: number
  inboundBytes: number
  inboundEnergy: number
}

export const MATRIX_LOCAL_ENERGY_FLOOR = 0.002
export const MATRIX_REMOTE_ENERGY_FLOOR = 0.00001

export function evaluateMatrixVerdict(metrics: MatrixVerdictMetrics): MatrixVerdict {
  if (metrics.localEnergy <= MATRIX_LOCAL_ENERGY_FLOOR) return 'fail'
  if (metrics.outboundBytes <= 0) return 'fail'
  if (metrics.inboundBytes <= 0) return 'inconclusive'
  if (metrics.inboundEnergy < MATRIX_REMOTE_ENERGY_FLOOR) return 'fail'
  return 'pass'
}
