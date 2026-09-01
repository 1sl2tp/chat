import { describe, expect, it, vi } from 'vitest'
import { clearCurrentPushSubscription, pushCleanupBrowserForRegistration } from './push-cleanup'

describe('root Push cleanup', () => {
  it('binds cleanup to the supplied owner registration only', async () => {
    const unsubscribe = vi.fn(async () => true)
    const getSubscription = vi.fn(async () => ({ unsubscribe }))
    const registration = {
      pushManager: { getSubscription },
    } as unknown as ServiceWorkerRegistration

    const browser = pushCleanupBrowserForRegistration(registration)
    const removed = await clearCurrentPushSubscription(browser)

    expect(removed).toBe(true)
    expect(getSubscription).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('unsubscribes the current service-worker push subscription before guest mode starts', async () => {
    const unsubscribe = vi.fn(async () => true)
    const browser = {
      async getSubscription() {
        return { unsubscribe }
      },
    }

    const removed = await clearCurrentPushSubscription(browser)

    expect(removed).toBe(true)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when the browser has no push subscription', async () => {
    const browser = {
      async getSubscription() {
        return null
      },
    }

    await expect(clearCurrentPushSubscription(browser)).resolves.toBe(false)
  })
})
