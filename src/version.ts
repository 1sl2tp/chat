export const APP_VERSION = 'CHAT-FND-0.5.0' as const

export function formatVersionLabel(buildId: string): string {
  const shortBuildId = buildId === 'dev' ? buildId : buildId.slice(0, 7)
  return `${APP_VERSION} · ${shortBuildId}`
}
