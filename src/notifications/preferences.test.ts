import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  notificationDeliveryOptions,
  saveNotificationPreferences,
  shouldDeliverNotification,
  type NotificationPreferences,
  type NotificationPreferencesStorage,
} from './preferences'

function memoryStorage(initial?: unknown): NotificationPreferencesStorage & { value: unknown } {
  return {
    value: initial,
    async read() { return this.value },
    async write(value) { this.value = value },
  }
}

describe('notification preferences', () => {
  it('defaults Chat/Call/system sound/vibration to enabled', async () => {
    const storage = memoryStorage()
    await expect(loadNotificationPreferences(storage)).resolves.toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
  })

  it('persists only normalized supported values', async () => {
    const storage = memoryStorage()
    const value: NotificationPreferences = {
      chat: false,
      call: true,
      sound: 'silent',
      vibrate: false,
    }

    await saveNotificationPreferences(storage, value)
    await expect(loadNotificationPreferences(storage)).resolves.toEqual(value)
  })

  it('filters Chat and Call push independently without disabling realtime app behavior', () => {
    const preferences: NotificationPreferences = {
      chat: false,
      call: true,
      sound: 'system',
      vibrate: true,
    }

    expect(shouldDeliverNotification('chat_message', preferences)).toBe(false)
    expect(shouldDeliverNotification('incoming_call', preferences)).toBe(true)
    expect(shouldDeliverNotification('other', preferences)).toBe(true)
  })

  it('maps silent and vibration preferences to NotificationOptions', () => {
    expect(notificationDeliveryOptions('incoming_call', {
      chat: true,
      call: true,
      sound: 'silent',
      vibrate: false,
    })).toEqual({ silent: true })

    expect(notificationDeliveryOptions('incoming_call', {
      chat: true,
      call: true,
      sound: 'system',
      vibrate: true,
    })).toEqual({ vibrate: [350, 180, 350, 900] })
  })

  it('writes through the storage owner exactly once', async () => {
    const write = vi.fn(async () => {})
    await saveNotificationPreferences({ read: async () => null, write }, DEFAULT_NOTIFICATION_PREFERENCES)
    expect(write).toHaveBeenCalledTimes(1)
  })
})
