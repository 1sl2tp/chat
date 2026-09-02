import { buildLabel } from './app/build-label'
import { pwaOwnerForPath, pwaRegistrationDescriptor, type PwaOwner } from './pwa/registration'
import { readServiceWorkerBuildId, shouldReloadForServiceWorker } from './pwa/version-sync'

const UI_BUILD_ID = import.meta.env.VITE_BUILD_ID ?? 'dev'

function mountBuildBadge(): void {
  if (typeof document === 'undefined' || document.getElementById('chat-build-label')) return

  const badge = document.createElement('small')
  badge.id = 'chat-build-label'
  badge.textContent = buildLabel(UI_BUILD_ID)
  badge.title = `Build ${UI_BUILD_ID}`
  badge.style.cssText = 'position:fixed;left:max(6px,env(safe-area-inset-left));bottom:max(4px,env(safe-area-inset-bottom));z-index:2147483647;padding:2px 5px;border-radius:5px;background:rgba(255,255,255,.82);color:#777;font:10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;pointer-events:none;opacity:.72'
  document.body.appendChild(badge)
}

export async function setupPwa(owner?: PwaOwner): Promise<ServiceWorkerRegistration | null> {
  mountBuildBadge()
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null

  const resolvedOwner = owner ?? pwaOwnerForPath(window.location.pathname)
  let reloadIssued = false
  let registration: ServiceWorkerRegistration | null = null

  async function syncWithController(): Promise<void> {
    if (reloadIssued) return

    const controller = navigator.serviceWorker.controller
    if (!controller) return

    const serviceWorkerBuildId = await readServiceWorkerBuildId(controller)
    if (!shouldReloadForServiceWorker(UI_BUILD_ID, serviceWorkerBuildId)) return

    const reloadKey = `chat-pwa-reload:${resolvedOwner}:${serviceWorkerBuildId}`
    if (sessionStorage.getItem(reloadKey) === '1') return

    sessionStorage.setItem(reloadKey, '1')
    reloadIssued = true
    window.location.reload()
  }

  async function checkForUpdate(): Promise<void> {
    try {
      await registration?.update()
      await syncWithController()
    } catch (error) {
      console.warn('PWA update check failed', error)
    }
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    void syncWithController()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  })

  window.addEventListener('pageshow', () => {
    void checkForUpdate()
  })

  const descriptor = pwaRegistrationDescriptor(resolvedOwner, window.location.pathname)
  try {
    registration = await navigator.serviceWorker.register(descriptor.scriptUrl, {
      scope: descriptor.scope,
      updateViaCache: 'none',
    })
    await checkForUpdate()
    return registration
  } catch (error) {
    console.error('PWA service worker registration failed', error)
    return null
  }
}
