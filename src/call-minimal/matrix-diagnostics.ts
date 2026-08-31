import { evaluateMatrixVerdict, type MatrixVerdict, type MatrixVerdictMetrics } from './matrix-verdict'

export interface MatrixDiagnosticInput extends MatrixVerdictMetrics {
  meterState: string
}

export interface PrimedAudioContext<T extends { resume: () => Promise<void> }> {
  context: T
  resumePromise: Promise<void>
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
  return evaluateMatrixVerdict(input)
}
