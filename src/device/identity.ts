import { classifyRuntime } from '../compat/runtime'

export type DeviceOwner = 'guest' | 'user2' | 'admin'
type DeviceStorage = Pick<Storage, 'getItem' | 'setItem'>

export const GUEST_DEVICE_KEY_STORAGE = 'chat.device.guest.key.v1'
export const USER_DEVICE_KEY_STORAGE = 'chat.device.user.key.v1'
export const ADMIN_DEVICE_KEY_STORAGE = 'chat.device.admin.key.v1'

const DEVICE_STORAGE_KEYS: Record<DeviceOwner, string> = {
  guest: GUEST_DEVICE_KEY_STORAGE,
  user2: USER_DEVICE_KEY_STORAGE,
  admin: ADMIN_DEVICE_KEY_STORAGE,
}

export function deviceOwnerForPath(pathname: string): Exclude<DeviceOwner, 'guest'> {
  return pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'user2'
}

function runtimeDeviceOwner(): Exclude<DeviceOwner, 'guest'> {
  return typeof location === 'undefined' ? 'user2' : deviceOwnerForPath(location.pathname)
}

function defaultStorage(owner: DeviceOwner): DeviceStorage {
  return owner === 'guest' ? sessionStorage : localStorage
}

export function getOrCreateDeviceKey(): string
export function getOrCreateDeviceKey(storage: DeviceStorage): string
export function getOrCreateDeviceKey(owner: DeviceOwner, storage?: DeviceStorage): string
export function getOrCreateDeviceKey(
  ownerOrStorage: DeviceOwner | DeviceStorage = runtimeDeviceOwner(),
  explicitStorage?: DeviceStorage,
): string {
  const owner: DeviceOwner = typeof ownerOrStorage === 'string' ? ownerOrStorage : runtimeDeviceOwner()
  const storage = typeof ownerOrStorage === 'string'
    ? explicitStorage ?? defaultStorage(owner)
    : ownerOrStorage
  const storageKey = DEVICE_STORAGE_KEYS[owner]
  const existing = storage.getItem(storageKey)
  if (existing) return existing

  const created = crypto.randomUUID()
  storage.setItem(storageKey, created)
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
