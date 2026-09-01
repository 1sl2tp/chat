import type { SupabaseClient } from '@supabase/supabase-js'

export type CallPushState = 'unsupported' | 'prompt' | 'enabled' | 'denied' | 'error'

export interface CallPushSubscriptionLike {
  endpoint: string
  getKey(name: string): ArrayBuffer | null
}

export interface CallPushManagerLike {
  getSubscription(): Promise<CallPushSubscriptionLike | null>
  subscribe(options: { userVisibleOnly: true; applicationServerKey: Uint8Array }): Promise<CallPushSubscriptionLike>
}

export interface CallPushBrowser {
  supported(): boolean
  permission(): NotificationPermission
  requestPermission(): Promise<NotificationPermission>
  ready(): Promise<{ pushManager: CallPushManagerLike }>
}

export class CallPushRegistration {
  private state: CallPushState = 'unsupported'
  private readonly listeners = new Set<(state: CallPushState) => void>()
  private readonly client: SupabaseClient
  private readonly deviceId: string
  private readonly browser: CallPushBrowser

  constructor(client: SupabaseClient, deviceId: string, browser: CallPushBrowser = defaultCallPushBrowser()) {
    this.client = client
    this.deviceId = deviceId
    this.browser = browser
  }

  getState(): CallPushState {
    return this.state
  }

  subscribe(listener: (state: CallPushState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  async sync(): Promise<void> {
    if (!this.browser.supported()) {
      this.publish('unsupported')
      return
    }

    const permission = this.browser.permission()
    if (permission === 'denied') {
      this.publish('denied')
      return
    }
    if (permission !== 'granted') {
      this.publish('prompt')
      return
    }

    await this.ensureSubscriptionSafely()
  }

  async enableFromUserGesture(): Promise<void> {
    if (!this.browser.supported()) {
      this.publish('unsupported')
      return
    }

    const permission = this.browser.permission() === 'granted'
      ? 'granted'
      : await this.browser.requestPermission()

    if (permission !== 'granted') {
      this.publish(permission === 'denied' ? 'denied' : 'prompt')
      return
    }

    await this.ensureSubscriptionSafely()
  }

  private async ensureSubscriptionSafely(): Promise<void> {
    try {
      await this.ensureSubscriptionAndUpsert()
      this.publish('enabled')
    } catch {
      this.publish('error')
    }
  }

  private async ensureSubscriptionAndUpsert(): Promise<void> {
    const registration = await this.browser.ready()
    const configResult = await this.client.functions.invoke('taphoaxyz-call-push', {
      body: { action: 'config' },
    })
    if (configResult.error) throw configResult.error

    const config = configResult.data as { public_key?: unknown } | null
    const publicKey = typeof config?.public_key === 'string' ? config.public_key : ''
    if (!publicKey) throw new Error('call_push_vapid_missing')

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(publicKey),
      })
    }

    const p256dh = subscription.getKey('p256dh')
    const auth = subscription.getKey('auth')
    if (!p256dh || !auth) throw new Error('call_push_subscription_keys_missing')

    const result = await this.client.rpc('chat_upsert_call_push_subscription', {
      p_device_id: this.deviceId,
      p_endpoint: subscription.endpoint,
      p_p256dh: encodeBase64Url(p256dh),
      p_auth: encodeBase64Url(auth),
    })
    if (result.error) throw result.error
  }

  private publish(state: CallPushState): void {
    if (this.state === state) return
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}

function defaultCallPushBrowser(): CallPushBrowser {
  return {
    supported() {
      return typeof navigator !== 'undefined'
        && 'serviceWorker' in navigator
        && typeof Notification !== 'undefined'
        && typeof PushManager !== 'undefined'
    },
    permission() {
      return Notification.permission
    },
    requestPermission() {
      return Notification.requestPermission()
    },
    async ready() {
      const registration = await navigator.serviceWorker.ready
      return {
        pushManager: registration.pushManager as unknown as CallPushManagerLike,
      }
    },
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function encodeBase64Url(buffer: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}
