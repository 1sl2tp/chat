export type MatrixVerdict = 'pass' | 'fail' | 'inconclusive'

export interface MatrixDiagnosticInput {
  meterState: string
  localEnergy: number
  outboundBytes: number
  inboundBytes: number
}

export interface PrimedAudioContext<T extends { resume: () => Promise<void> }> {
  context: T
  resumePromise: Promise<void>
}

export function createMatrixRunSessionId(randomUUID: () => string = () => crypto.randomUUID()): string {
  return randomUUID()
}

export function primeDiagnosticAudioContext<T extends { resume: () => Promise<void> }>(
  createContext: () => T,
): PrimedAudioContext<T> {
  const context = createContext()
  const resumePromise = context.resume()
  return { context, resumePromise }
}

export function classifyMatrixResult(input: MatrixDiagnosticInput): MatrixVerdict {
  if (input.meterState !== 'running') return 'inconclusive'
  if (input.localEnergy <= 0.002 || input.outboundBytes <= 0) return 'fail'
  return input.inboundBytes > 0 ? 'pass' : 'inconclusive'
}
