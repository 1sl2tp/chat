import { describe, expect, it } from 'vitest'
import {
  ADMIN_AUTH_STORAGE_KEY,
  GUEST_AUTH_STORAGE_KEY,
  USER_AUTH_STORAGE_KEY,
  authStorageDescriptor,
} from '../supabase/client'
import {
  ADMIN_DEVICE_KEY_STORAGE,
  GUEST_DEVICE_KEY_STORAGE,
  USER_DEVICE_KEY_STORAGE,
  getOrCreateDeviceKey,
} from '../device/identity'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('root session ownership', () => {
  it('uses three different auth namespaces and keeps guest auth session-scoped', () => {
    expect(new Set([
      GUEST_AUTH_STORAGE_KEY,
      USER_AUTH_STORAGE_KEY,
      ADMIN_AUTH_STORAGE_KEY,
    ]).size).toBe(3)

    expect(authStorageDescriptor('guest')).toEqual({
      key: GUEST_AUTH_STORAGE_KEY,
      persistence: 'session',
    })
    expect(authStorageDescriptor('user2')).toEqual({
      key: USER_AUTH_STORAGE_KEY,
      persistence: 'local',
    })
    expect(authStorageDescriptor('admin')).toEqual({
      key: ADMIN_AUTH_STORAGE_KEY,
      persistence: 'local',
    })
  })

  it('uses independent device keys for guest, User2 and Admin on one machine', () => {
    expect(new Set([
      GUEST_DEVICE_KEY_STORAGE,
      USER_DEVICE_KEY_STORAGE,
      ADMIN_DEVICE_KEY_STORAGE,
    ]).size).toBe(3)

    const sharedBrowserStorage = new MemoryStorage()
    const guestSessionStorage = new MemoryStorage()

    const guest = getOrCreateDeviceKey('guest', guestSessionStorage)
    const user2 = getOrCreateDeviceKey('user2', sharedBrowserStorage)
    const admin = getOrCreateDeviceKey('admin', sharedBrowserStorage)

    expect(guest).not.toBe(user2)
    expect(user2).not.toBe(admin)
    expect(admin).not.toBe(guest)

    expect(getOrCreateDeviceKey('guest', guestSessionStorage)).toBe(guest)
    expect(getOrCreateDeviceKey('user2', sharedBrowserStorage)).toBe(user2)
    expect(getOrCreateDeviceKey('admin', sharedBrowserStorage)).toBe(admin)
  })
})
