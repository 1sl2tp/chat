import { describe, expect, it, vi } from 'vitest'
import { clearCurrentPushSubscription } from './push-cleanup'

describe('root Push cleanup', () => {
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
