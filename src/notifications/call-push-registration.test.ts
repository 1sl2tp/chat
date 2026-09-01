import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CallPushRegistration,
  type CallPushBrowser,
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
    invoke = vi.fn(async () => ({ data: { public_key: VAPID_PUBLIC_KEY }, error: null }))
    rpc = vi.fn(async () => ({ data: true, error: null }))
  })

  function createRegistration(overrides: Partial<CallPushBrowser> = {}) {
    const browser: CallPushBrowser = {
      supported: () => true,
      permission: () => permission,
      requestPermission,
      ready: async () => ({
        pushManager: {
          getSubscription,
          subscribe: pushSubscribe,
        },
      }),
      ...overrides,
    }

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

  it('requests permission only from enableFromUserGesture and stores the subscription', async () => {
    const registration = createRegistration()

    await registration.enableFromUserGesture()

    expect(requestPermission).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith('taphoaxyz-call-push', {
      body: { action: 'config' },
    })
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
    expect(registration.getState()).toBe('enabled')
  })

  it('reuses an existing browser subscription', async () => {
    permission = 'granted'
    getSubscription.mockResolvedValue(subscription)
    const registration = createRegistration()

    await registration.sync()

    expect(pushSubscribe).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledOnce()
    expect(registration.getState()).toBe('enabled')
  })

  it('marks denied permission without trying PushManager.subscribe', async () => {
    permission = 'denied'
    const registration = createRegistration()

    await registration.sync()

    expect(pushSubscribe).not.toHaveBeenCalled()
    expect(registration.getState()).toBe('denied')
  })

  it('marks unsupported without requesting permission', async () => {
    const registration = createRegistration({ supported: () => false })

    await registration.enableFromUserGesture()

    expect(requestPermission).not.toHaveBeenCalled()
    expect(registration.getState()).toBe('unsupported')
  })
})
