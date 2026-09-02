export const APP_RELEASE = '0.17.5'

export function releaseBadgeText(buildId: string): string {
  const normalized = buildId.trim() || 'local'
  const shortBuild = normalized === 'local' ? normalized : normalized.slice(0, 7)
  return `v${APP_RELEASE} · ${shortBuild}`
}

export function mountReleaseBadge(doc: Document = document): HTMLElement {
  const existing = doc.querySelector<HTMLElement>('#taphoa-release-badge')
  if (existing) return existing

  const buildId = import.meta.env.VITE_BUILD_ID || 'local'
  const badge = doc.createElement('div')
  badge.id = 'taphoa-release-badge'
  badge.textContent = releaseBadgeText(buildId)
  badge.title = `TAPHOA ${APP_RELEASE} · build ${buildId}`
  badge.setAttribute('aria-label', `Phiên bản TAPHOA ${APP_RELEASE}`)
  badge.style.cssText = [
    'position:fixed',
    'top:calc(env(safe-area-inset-top, 0px) + 4px)',
    'right:6px',
    'z-index:2147483647',
    'pointer-events:none',
    'padding:2px 5px',
    'border-radius:999px',
    'background:rgba(255,255,255,.82)',
    'color:#667085',
    'font:500 10px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'letter-spacing:.01em',
    'box-shadow:0 1px 2px rgba(16,24,40,.08)',
    'opacity:.78',
  ].join(';')

  doc.body.appendChild(badge)
  return badge
}
