export function shouldReloadForServiceWorker(uiBuildId: string, serviceWorkerBuildId: string | null): boolean {
  return serviceWorkerBuildId !== null && serviceWorkerBuildId !== uiBuildId
}

export function readServiceWorkerBuildId(controller: ServiceWorker, timeoutMs = 1500): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    let settled = false

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      channel.port1.close()
      resolve(value)
    }

    const timeout = window.setTimeout(() => finish(null), timeoutMs)

    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: unknown; buildId?: unknown } | null
      if (data?.type !== 'CHAT_BUILD_ID' || typeof data.buildId !== 'string') {
        finish(null)
        return
      }
      finish(data.buildId)
    }

    controller.postMessage({ type: 'CHAT_GET_BUILD_ID' }, [channel.port2])
  })
}
