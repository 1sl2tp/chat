import { classifyRuntime } from '../compat/runtime'

const DEVICE_KEY_STORAGE = 'chat.device.key.v1'

export function getOrCreateDeviceKey(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): string {
  const existing = storage.getItem(DEVICE_KEY_STORAGE)
  if (existing) return existing

  const created = crypto.randomUUID()
  storage.setItem(DEVICE_KEY_STORAGE, created)
  return created
}

export function getDeviceLabel(): string {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true
  return standalone ? 'PWA' : 'Web'
}

export function getDevicePlatform(): string {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true
  return classifyRuntime({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone,
  }).os
}
