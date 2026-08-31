import { registerSW } from 'virtual:pwa-register'

export function setupPwa(): void {
  if (!('serviceWorker' in navigator)) return

  const hadController = navigator.serviceWorker.controller !== null
  let reloadingForUpdate = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadingForUpdate) return
    reloadingForUpdate = true
    window.location.reload()
  })

  const updateSW = registerSW({
    immediate: true,
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
