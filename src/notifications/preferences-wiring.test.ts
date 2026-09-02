import { describe, expect, it } from 'vitest'
import swSource from '../sw.ts?raw'
import pushSource from './call-push-registration.ts?raw'

describe('notification preference wiring', () => {
  it('loads persisted preferences before deciding whether a push becomes a system notification', () => {
    expect(swSource).toContain('loadNotificationPreferences')
    expect(swSource).toContain('shouldDeliverNotification')
    expect(swSource).toContain('createCacheNotificationPreferencesStorage')
  })

  it('applies sound and vibration preferences to the system notification options', () => {
    expect(swSource).toContain('notificationDeliveryOptions')
  })

  it('lets the existing test-notification owner accept delivery options', () => {
    expect(pushSource).toContain('testFromUserGesture(options')
    expect(pushSource).toContain('...options')
  })
})
