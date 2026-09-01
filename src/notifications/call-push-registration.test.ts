import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CallPushRegistration,
  type CallPushBrowser,
  type CallPushManagerLike,
  type CallPushSubscriptionLike,
} from './call-push-registration'

const DEVICE_ID = '11111111-1111-4111-8111-111111111111'
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa40HIvZxvwwcKFmS-vF9nY8hJj6rCw7H8G1pQeG4L9m4bH2gQ0f7aB9GxQw0E'

function bytes(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer
}

describe('CallPushRegistration', () => {
  let permission: NotificationPermission
  let requestPermission: ReturnType<typeof vi.fn>
  let getSubscription: ReturnType<typeof vi.fn>
  let pushSubscribe: ReturnType<typeof vi.fn>
  let invoke: ReturnType<typeof vi.fn>
  let rpc: ReturnType<typeof vi.fn>
  let subscription: CallPushSubscriptionLike

  beforeEach(() => {
    permission = 'default'
    requestPermission = vi.fn(async () => 'granted' as NotificationPermission)
    subscription = {
      endpoint: 'https://push.example/subscription',
      getKey(name: string) {
        if (name === 'p256dh') return bytes('p256dh-key')
        if (name === 'auth') return bytes('auth-key')
        return null
      },
    }
    getSubscription = vi.fn(async () => null)
    pushSubscribe = vi.fn(async () => subscription)
    invoke = vi.fn(async (_slug: string, options?: { body?: { action?: string } }) => {
      if (options?.body?.action === 'config') return { data: { public_key: VAPID_PUBLIC_KEY }, error: null }
      if (options?.body?.action === 'test') return { data: { ok: true, delivered: 1, expired: 0 }, error: null }
      return { data: null, error: new Error('unexpected_action') }
    })
    rpc = vi.fn(async () => ({ data: true, error: null }))
  })

  function createRegistration(overrides: Partial<CallPushBrowser> = {}) {
    const pushManager: CallPushManagerLike = {
      getSubscription: getSubscription as unknown as CallPushManagerLike['getSubscription'],
      subscribe: pushSubscribe as unknown as CallPushManagerLike['subscribe'],
    }
    const browser = {
      supported: () => true,
      iosHomeScreenRequired: () => false,
      permission: () => permission,
      requestPermission: requestPermission as unknown as CallPushBrowser['requestPermission'],
      ready: async () => ({ pushManager }),
      ...overrides,
    } as unknown as CallPushBrowser

    const client = {
      functions: { invoke },
      rpc,
    } as unknown as SupabaseClient

    return new CallPushRegistration(client, DEVICE_ID, browser)
  }

  it('never requests permission during sync', async () => {
    const registration = createRegistration()
    await registration.sync()
    expect(requestPermission).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
    expect(registration.getState()).toBe('prompt')
  })

  it('requests permission only from enableFromUserGesture, stores the subscription, and proves delivery', async () => {
    const registration = createRegistration()
    await registration.enableFromUserGesture()

    expect(requestPermission).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenNthCalledWith(1, 'taphoaxyz-call-push', { body: { action: 'config' } })
    expect(pushSubscribe).toHaveBeenCalledWith(expect.objectContaining({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    }))
    expect(rpc).toHaveBeenCalledWith('chat_upsert_call_push_subscription', expect.objectContaining({
      p_device_id: DEVICE_ID,
      p_endpoint: subscription.endpoint,
      p_p256dh: expect.any(String),
      p_auth: expect.any(String),
    }))
    expect(invoke).toHaveBeenNthCalledWith(2, 'taphoaxyz-call-push', {
      body: { action: 'test', device_id: DEVICE_ID },
    })
    expect(registration.getState()).toBe('enabled')
    expect(registration.getIssue()).toBeNull()
  })

  it('reuses an existing browser subscription during sync without sending a test notification', async () => {
    permission = 'granted'
    getSubscription.mockResolvedValue(subscription)
    const registration = createRegistration()
    await registration.sync()

    expect(pushSubscribe).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(registration.getState()).toBe('enabled')
  })

  it('can re-test delivery from an explicit user gesture after sync', async () => {
    permission = 'granted'
    getSubscription.mockResolvedValue(subscription)
    const registration = createRegistration()
    await registration.sync()
    await registration.testFromUserGesture()

    expect(invoke).toHaveBeenLastCalledWith('taphoaxyz-call-push', {
      body: { action: 'test', device_id: DEVICE_ID },
    })
    expect(registration.getState()).toBe('enabled')
  })

  it('reports iOS Home Screen installation as the reason push is unsupported', async () => {
    const registration = createRegistration({
      supported: () => false,
      iosHomeScreenRequired: () => true,
    } as Partial<CallPushBrowser>)
    await registration.sync()

    expect(registration.getState()).toBe('unsupported')
    expect(registration.getIssue()).toBe('ios_home_screen_required')
  })

  it('preserves the registration failure reason instead of silently collapsing to error', async () => {
    permission = 'granted'
    getSubscription.mockResolvedValue(subscription)
    rpc.mockResolvedValue({ data: null, error: new Error('invalid_device') })
    const registration = createRegistration()
    await registration.sync()

    expect(registration.getState()).toBe('error')
    expect(registration.getIssue()).toBe('registration_failed')
    expect(registration.getDetail()).toContain('invalid_device')
  })

  it('fails readiness when the end-to-end test notification reaches no current device', async () => {
    invoke.mockImplementation(async (_slug: string, options?: { body?: { action?: string } }) => {
      if (options?.body?.action === 'config') return { data: { public_key: VAPID_PUBLIC_KEY }, error: null }
      return { data: { ok: true, delivered: 0, expired: 0 }, error: null }
    })
    const registration = createRegistration()
    await registration.enableFromUserGesture()

    expect(registration.getState()).toBe('error')
    expect(registration.getIssue()).toBe('delivery_failed')
  })

  it('marks denied permission without trying PushManager.subscribe', async () => {
    permission = 'denied'
    const registration = createRegistration()
    await registration.sync()

    expect(pushSubscribe).not.toHaveBeenCalled()
    expect(registration.getState()).toBe('denied')
    expect(registration.getIssue()).toBe('permission_denied')
  })

  it('marks generic unsupported without requesting permission', async () => {
    const registration = createRegistration({ supported: () => false })
    await registration.enableFromUserGesture()

    expect(requestPermission).not.toHaveBeenCalled()
    expect(registration.getState()).toBe('unsupported')
    expect(registration.getIssue()).toBe('unsupported')
  })
})
