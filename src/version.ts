export const APP_VERSION = 'CHAT-FND-0.2.0' as const

export function formatVersionLabel(buildId: string): string {
  return `${APP_VERSION} · ${buildId}`
}
