export const APP_VERSION = 'CHAT-ADMIN-0.15.0' as const

export function formatVersionLabel(buildId: string): string {
  const shortBuildId = buildId === 'dev' ? buildId : buildId.slice(0, 7)
  return `${APP_VERSION} · ${shortBuildId}`
}
