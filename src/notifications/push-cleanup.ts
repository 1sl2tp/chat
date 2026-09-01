export interface PushCleanupBrowser {
  getSubscription(): Promise<{ unsubscribe(): Promise<boolean> } | null>
}

export function pushCleanupBrowserForRegistration(
  registration: ServiceWorkerRegistration,
): PushCleanupBrowser {
  return {
    async getSubscription() {
      return registration.pushManager.getSubscription()
    },
  }
}

export async function clearCurrentPushSubscription(
  browser: PushCleanupBrowser,
): Promise<boolean> {
  try {
    const subscription = await browser.getSubscription()
    if (!subscription) return false
    return await subscription.unsubscribe()
  } catch {
    return false
  }
}
