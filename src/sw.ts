/// <reference lib="webworker" />

import { serviceWorkerAssetBase } from './deployment'
import { parsePushPayload, shouldShowSystemNotification } from './notifications/payload'
import {
  createCacheNotificationPreferencesStorage,
  loadNotificationPreferences,
  notificationDeliveryOptions,
  shouldDeliverNotification,
  type NotificationPreferences,
} from './notifications/preferences'
import { resolveScopedNavigation } from './pwa/navigation'
import { hasVisibleWindowForOwner, isWindowOwnedBy } from './pwa/owner-visibility'
import { pwaOwnerForPath, type PwaOwner } from './pwa/registration'

declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>
  navigator: WorkerNavigator & {
    setAppBadge?: (contents?: number) => Promise<void>
  }
}

const BUILD_ID = import.meta.env.VITE_BUILD_ID ?? 'dev'
const CACHE_PREFIX = 'chat-precache-'
const manifestEntries = self.__WB_MANIFEST
const ASSET_BASE_URL = serviceWorkerAssetBase(self.location.href)
const CACHE_NAME = `${CACHE_PREFIX}${hashManifest(manifestEntries)}`
const PRECACHE_URLS = manifestEntries.map((entry) => new URL(entry.url, ASSET_BASE_URL).href)
const APP_SHELL_URL = new URL('./index.html', self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(PRECACHE_URLS)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  const data = event.data as { type?: unknown } | null
  if (data?.type !== 'CHAT_GET_BUILD_ID') return
  event.ports[0]?.postMessage({ type: 'CHAT_BUILD_ID', buildId: BUILD_ID })
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin) return

  event.respondWith((async () => {
    const cached = await caches.match(request)
    if (cached) return cached

    try {
      return await fetch(request)
    } catch (error) {
      if (request.mode === 'navigate') {
        const appShell = await caches.match(APP_SHELL_URL)
        if (appShell) return appShell
      }
      throw error
    }
  })())
})

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(readPushData(event))

  event.waitUntil((async () => {
    const preferences = await loadNotificationPreferences(
      createCacheNotificationPreferencesStorage(self.registration.scope),
    )
    const setBadge = self.navigator.setAppBadge
    const badgeTask = payload.badge !== undefined && typeof setBadge === 'function'
      ? setBadge.call(self.navigator, payload.badge)
      : Promise.resolve()

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const windowClients = windows.map((client) => client as WindowClient)
    const owner = pwaOwnerForPath(new URL(self.registration.scope).pathname)
    const hasVisibleWindow = hasVisibleWindowForOwner(windowClients, owner)

    let showNotification = shouldDeliverNotification(payload.type, preferences)
      && shouldShowSystemNotification(payload.type, hasVisibleWindow)
    if (showNotification && payload.type === 'chat_message' && payload.conversationId) {
      const exactConversationVisible = await isConversationVisible(windowClients, payload.conversationId, owner)
      showNotification = !exactConversationVisible
    }

    const notificationTask = showNotification
      ? showSystemNotification(payload, preferences)
      : Promise.resolve()

    await Promise.all([notificationTask, badgeTask])
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil((async () => {
    const data = event.notification.data as { navigate?: unknown } | undefined
    const target = resolveScopedNavigation(self.registration.scope, data?.navigate)
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

    for (const client of windows) {
      const windowClient = client as WindowClient
      const clientUrl = new URL(windowClient.url)
      const scopeUrl = new URL(self.registration.scope)

      if (clientUrl.origin === scopeUrl.origin && clientUrl.pathname.startsWith(scopeUrl.pathname)) {
        await windowClient.navigate(target.href)
        return windowClient.focus()
      }
    }

    return self.clients.openWindow(target.href)
  })())
})

async function isConversationVisible(
  windows: readonly WindowClient[],
  conversationId: string,
  owner: PwaOwner,
): Promise<boolean> {
  const visible = windows.filter((client) => client.visibilityState === 'visible' && isWindowOwnedBy(client, owner))
  if (visible.length === 0) return false

  const replies = await Promise.all(visible.map((client) => new Promise<boolean>((resolve) => {
    const channel = new MessageChannel()
    let settled = false
    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => finish(false), 150)
    channel.port1.onmessage = (event) => {
      clearTimeout(timer)
      finish(Boolean((event.data as { matches?: unknown } | null)?.matches))
    }
    client.postMessage({ type: 'CHAT_NOTIFICATION_CONTEXT_QUERY', conversationId }, [channel.port2])
  })))

  return replies.some(Boolean)
}

function showSystemNotification(
  payload: ReturnType<typeof parsePushPayload>,
  preferences: NotificationPreferences,
): Promise<void> {
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: payload.body,
    tag: payload.tag,
    data: { navigate: payload.navigate },
    ...notificationDeliveryOptions(payload.type, preferences),
  }
  return self.registration.showNotification(payload.title, options)
}

function readPushData(event: PushEvent): unknown {
  if (!event.data) return null

  try {
    return event.data.json()
  } catch {
    return { body: event.data.text() }
  }
}

function hashManifest(entries: Array<{ url: string; revision?: string | null }>): string {
  const source = entries.map((entry) => `${entry.url}:${entry.revision ?? ''}`).join('|')
  let hash = 2166136261

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}
