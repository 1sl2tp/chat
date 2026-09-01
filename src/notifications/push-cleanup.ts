export interface PushCleanupBrowser {
  getSubscription(): Promise<{ unsubscribe(): Promise<boolean> } | null>
}

function defaultPushCleanupBrowser(): PushCleanupBrowser {
  return {
    async getSubscription() {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
      const registration = await navigator.serviceWorker.ready
      return registration.pushManager.getSubscription()
    },
  }
}

export async function clearCurrentPushSubscription(
  browser: PushCleanupBrowser = defaultPushCleanupBrowser(),
): Promise<boolean> {
  try {
    const subscription = await browser.getSubscription()
    if (!subscription) return false
    return await subscription.unsubscribe()
  } catch {
    return false
  }
}
