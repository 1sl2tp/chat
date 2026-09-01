import type { SupabaseClient } from '@supabase/supabase-js'

export type CallPushState = 'unsupported' | 'prompt' | 'enabled' | 'denied' | 'error'
export type CallPushIssue = 'ios_home_screen_required' | 'unsupported' | 'permission_denied' | 'registration_failed' | 'delivery_failed' | null

export interface CallPushSubscriptionLike {
  endpoint: string
  unsubscribe(): Promise<boolean>
  getKey(name: string): ArrayBuffer | null
}

export interface CallPushManagerLike {
  getSubscription(): Promise<CallPushSubscriptionLike | null>
  subscribe(options: { userVisibleOnly: true; applicationServerKey: Uint8Array }): Promise<CallPushSubscriptionLike>
}

export interface CallPushBrowser {
  supported(): boolean
  iosHomeScreenRequired(): boolean
  android(): boolean
  permission(): NotificationPermission
  requestPermission(): Promise<NotificationPermission>
  ready(): Promise<{ pushManager: CallPushManagerLike }>
  showLocalNotification(title: string, options: NotificationOptions): Promise<void>
}

export function callPushBrowserForRegistration(registration: ServiceWorkerRegistration): CallPushBrowser {
  return {
    supported() {
      return typeof navigator !== 'undefined'
        && typeof Notification !== 'undefined'
        && typeof PushManager !== 'undefined'
    },
    iosHomeScreenRequired() {
      if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
      const ios = /iPad|iPhone|iPod/u.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (!ios) return false
      const legacyStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
      const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches === true
      return !legacyStandalone && !displayStandalone
    },
    android() {
      return typeof navigator !== 'undefined' && /Android/u.test(navigator.userAgent)
    },
    permission() {
      return Notification.permission
    },
    requestPermission() {
      return Notification.requestPermission()
    },
    async ready() {
      return {
        pushManager: registration.pushManager as unknown as CallPushManagerLike,
      }
    },
    async showLocalNotification(title, options) {
      await registration.showNotification(title, options)
    },
  }
}

export class CallPushRegistration {
  private state: CallPushState = 'unsupported'
  private issue: CallPushIssue = null
  private detail = ''
  private readonly listeners = new Set<(state: CallPushState) => void>()
  private readonly client: SupabaseClient
  private readonly deviceId: string
  private readonly browser: CallPushBrowser

  constructor(client: SupabaseClient, deviceId: string, browser: CallPushBrowser) {
    this.client = client
    this.deviceId = deviceId
    this.browser = browser
  }

  getState(): CallPushState {
    return this.state
  }

  getIssue(): CallPushIssue {
    return this.issue
  }

  getDetail(): string {
    return this.detail
  }

  subscribe(listener: (state: CallPushState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  async sync(): Promise<void> {
    if (this.browser.iosHomeScreenRequired()) {
      this.publish('unsupported', 'ios_home_screen_required')
      return
    }
    if (!this.browser.supported()) {
      this.publish('unsupported', 'unsupported')
      return
    }

    const permission = this.browser.permission()
    if (permission === 'denied') {
      this.publish('denied', 'permission_denied')
      return
    }
    if (permission !== 'granted') {
      this.publish('prompt')
      return
    }

    await this.ensureSubscriptionSafely(false)
  }

  async enableFromUserGesture(): Promise<void> {
    if (this.browser.iosHomeScreenRequired()) {
      this.publish('unsupported', 'ios_home_screen_required')
      return
    }
    if (!this.browser.supported()) {
      this.publish('unsupported', 'unsupported')
      return
    }

    const permission = this.browser.permission() === 'granted'
      ? 'granted'
      : await this.browser.requestPermission()

    if (permission !== 'granted') {
      this.publish(permission === 'denied' ? 'denied' : 'prompt', permission === 'denied' ? 'permission_denied' : null)
      return
    }

    await this.ensureSubscriptionSafely(true)
  }

  async testFromUserGesture(): Promise<void> {
    if (this.state !== 'enabled') {
      await this.enableFromUserGesture()
      return
    }

    try {
      await this.browser.showLocalNotification('TAPHOA local test', {
        body: 'Thông báo trực tiếp từ PWA',
        tag: `local-test-${Date.now()}`,
      })
      if (this.browser.android()) {
        await this.ensureSubscriptionAndUpsert(true)
      }
      await this.sendReadinessProbe()
      this.publish('enabled')
    } catch (error) {
      this.publish('error', 'delivery_failed', errorMessage(error))
    }
  }

  private async ensureSubscriptionSafely(proveDelivery: boolean): Promise<void> {
    try {
      await this.ensureSubscriptionAndUpsert()
    } catch (error) {
      this.publish('error', 'registration_failed', errorMessage(error))
      return
    }

    if (proveDelivery) {
      try {
        await this.sendReadinessProbe()
      } catch (error) {
        this.publish('error', 'delivery_failed', errorMessage(error))
        return
      }
    }

    this.publish('enabled')
  }

  private async ensureSubscriptionAndUpsert(forceRotate = false): Promise<void> {
    const registration = await this.browser.ready()
    const configResult = await this.client.functions.invoke('taphoaxyz-call-push', {
      body: { action: 'config' },
    })
    if (configResult.error) throw configResult.error

    const config = configResult.data as { public_key?: unknown } | null
    const publicKey = typeof config?.public_key === 'string' ? config.public_key : ''
    if (!publicKey) throw new Error('call_push_vapid_missing')

    let subscription = await registration.pushManager.getSubscription()
    if (forceRotate && subscription) {
      const removed = await subscription.unsubscribe()
      if (!removed) throw new Error('push_subscription_unsubscribe_failed')
      subscription = null
    }
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

  private async sendReadinessProbe(): Promise<void> {
    const result = await this.client.functions.invoke('taphoaxyz-call-push', {
      body: { action: 'test', device_id: this.deviceId },
    })
    if (result.error) throw result.error

    const payload = result.data as { delivered?: unknown } | null
    const delivered = typeof payload?.delivered === 'number' ? payload.delivered : 0
    if (delivered < 1) throw new Error('push_test_not_delivered')
  }

  private publish(state: CallPushState, issue: CallPushIssue = null, detail = ''): void {
    if (this.state === state && this.issue === issue && this.detail === detail) return
    this.state = state
    this.issue = issue
    this.detail = detail
    for (const listener of this.listeners) listener(state)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
