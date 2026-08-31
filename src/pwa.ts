import { registerSW } from 'virtual:pwa-register'
import { readServiceWorkerBuildId, shouldReloadForServiceWorker } from './pwa/version-sync'

const UI_BUILD_ID = import.meta.env.VITE_BUILD_ID ?? 'dev'

export function setupPwa(): void {
  if (!('serviceWorker' in navigator)) return

  let reloadIssued = false
  let registration: ServiceWorkerRegistration | undefined

  async function syncWithController(): Promise<void> {
    if (reloadIssued) return

    const controller = navigator.serviceWorker.controller
    if (!controller) return

    const serviceWorkerBuildId = await readServiceWorkerBuildId(controller)
    if (!shouldReloadForServiceWorker(UI_BUILD_ID, serviceWorkerBuildId)) return

    const reloadKey = `chat-pwa-reload:${serviceWorkerBuildId}`
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

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, currentRegistration) {
      registration = currentRegistration
      void checkForUpdate()
    },
    onNeedRefresh() {
      void updateSW(true)
    },
    onOfflineReady() {
      console.info('PWA offline cache is ready')
    },
    onRegisterError(error) {
      console.error('PWA service worker registration failed', error)
    },
  })
}
