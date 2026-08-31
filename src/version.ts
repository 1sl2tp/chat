export const APP_VERSION = 'CHAT-UI-0.8.1' as const

export function formatVersionLabel(buildId: string): string {
  const shortBuildId = buildId === 'dev' ? buildId : buildId.slice(0, 7)
  return `${APP_VERSION} · ${shortBuildId}`
}
