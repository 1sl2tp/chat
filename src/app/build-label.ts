export function buildLabel(buildId: string | undefined): string {
  const normalized = buildId?.trim() ?? ''
  return normalized ? normalized.slice(0, 8) : 'dev'
}
