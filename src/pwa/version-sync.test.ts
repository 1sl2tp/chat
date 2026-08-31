import { describe, expect, it } from 'vitest'
import { shouldReloadForServiceWorker } from './version-sync'

describe('PWA service worker version sync', () => {
  it('reloads when the controlling service worker build differs from the UI build', () => {
    expect(shouldReloadForServiceWorker('ui-old', 'sw-new')).toBe(true)
  })

  it('does not reload when UI and service worker builds match', () => {
    expect(shouldReloadForServiceWorker('same-build', 'same-build')).toBe(false)
  })

  it('does not reload when the service worker build is unknown', () => {
    expect(shouldReloadForServiceWorker('ui-build', null)).toBe(false)
  })
})
