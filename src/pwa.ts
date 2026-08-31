import { registerSW } from 'virtual:pwa-register'

export function setupPwa(): void {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('PWA offline cache is ready')
    },
    onRegisterError(error) {
      console.error('PWA service worker registration failed', error)
    }
  })
}
