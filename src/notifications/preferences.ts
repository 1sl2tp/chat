export type NotificationSoundMode = 'system' | 'silent'

export interface NotificationPreferences {
  chat: boolean
  call: boolean
  sound: NotificationSoundMode
  vibrate: boolean
}

export interface NotificationPreferencesStorage {
  read(): Promise<unknown>
  write(value: NotificationPreferences): Promise<void>
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  chat: true,
  call: true,
  sound: 'system',
  vibrate: true,
}

const CACHE_NAME = 'chat-notification-preferences-v1'
const CACHE_KEY = '__taphoa_notification_preferences__'

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  const input = value as Partial<Record<keyof NotificationPreferences, unknown>>
  return {
    chat: typeof input.chat === 'boolean' ? input.chat : DEFAULT_NOTIFICATION_PREFERENCES.chat,
    call: typeof input.call === 'boolean' ? input.call : DEFAULT_NOTIFICATION_PREFERENCES.call,
    sound: input.sound === 'silent' || input.sound === 'system' ? input.sound : DEFAULT_NOTIFICATION_PREFERENCES.sound,
    vibrate: typeof input.vibrate === 'boolean' ? input.vibrate : DEFAULT_NOTIFICATION_PREFERENCES.vibrate,
  }
}

export async function loadNotificationPreferences(
  storage: NotificationPreferencesStorage,
): Promise<NotificationPreferences> {
  return normalizeNotificationPreferences(await storage.read())
}

export async function saveNotificationPreferences(
  storage: NotificationPreferencesStorage,
  value: NotificationPreferences,
): Promise<void> {
  await storage.write(normalizeNotificationPreferences(value))
}

export function shouldDeliverNotification(
  type: string | undefined,
  preferences: NotificationPreferences,
): boolean {
  if (type === 'chat_message') return preferences.chat
  if (type === 'incoming_call') return preferences.call
  return true
}

export function notificationDeliveryOptions(
  type: string | undefined,
  preferences: NotificationPreferences,
): NotificationOptions & { vibrate?: number[] } {
  const options: NotificationOptions & { vibrate?: number[] } = {}
  if (preferences.sound === 'silent') options.silent = true
  if (preferences.vibrate && type === 'incoming_call') options.vibrate = [350, 180, 350, 900]
  return options
}

export function createCacheNotificationPreferencesStorage(
  scope: string,
  cacheStorage: CacheStorage = caches,
): NotificationPreferencesStorage {
  const key = new URL(CACHE_KEY, scope).href
  return {
    async read() {
      try {
        const cache = await cacheStorage.open(CACHE_NAME)
        const response = await cache.match(key)
        if (!response) return null
        return await response.json()
      } catch {
        return null
      }
    },
    async write(value) {
      const cache = await cacheStorage.open(CACHE_NAME)
      await cache.put(key, new Response(JSON.stringify(value), {
        headers: { 'content-type': 'application/json' },
      }))
    },
  }
}
