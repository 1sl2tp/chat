import { describe, expect, it } from 'vitest'
import { ADMIN_AUTH_STORAGE_KEY, GUEST_AUTH_STORAGE_KEY, USER_AUTH_STORAGE_KEY } from '../supabase/client'
import { ADMIN_DEVICE_KEY_STORAGE, GUEST_DEVICE_KEY_STORAGE, USER_DEVICE_KEY_STORAGE } from '../device/identity'
import { clearGuestLocalState, shouldClearGuestOnPageHide } from './guest-lifecycle'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

describe('guest lifecycle cleanup', () => {
  it('removes only User1 auth/device keys and leaves User2/Admin intact', () => {
    const session = new MemoryStorage()
    const local = new MemoryStorage()

    session.setItem(GUEST_AUTH_STORAGE_KEY, 'guest-auth')
    session.setItem(GUEST_DEVICE_KEY_STORAGE, 'guest-device')
    local.setItem(USER_AUTH_STORAGE_KEY, 'user-auth')
    local.setItem(USER_DEVICE_KEY_STORAGE, 'user-device')
    local.setItem(ADMIN_AUTH_STORAGE_KEY, 'admin-auth')
    local.setItem(ADMIN_DEVICE_KEY_STORAGE, 'admin-device')

    clearGuestLocalState(session)

    expect(session.getItem(GUEST_AUTH_STORAGE_KEY)).toBeNull()
    expect(session.getItem(GUEST_DEVICE_KEY_STORAGE)).toBeNull()
    expect(local.getItem(USER_AUTH_STORAGE_KEY)).toBe('user-auth')
    expect(local.getItem(USER_DEVICE_KEY_STORAGE)).toBe('user-device')
    expect(local.getItem(ADMIN_AUTH_STORAGE_KEY)).toBe('admin-auth')
    expect(local.getItem(ADMIN_DEVICE_KEY_STORAGE)).toBe('admin-device')
  })

  it('clears only a real User1 page exit, not User2 or BFCache suspension', () => {
    expect(shouldClearGuestOnPageHide('guest', false)).toBe(true)
    expect(shouldClearGuestOnPageHide('guest', true)).toBe(false)
    expect(shouldClearGuestOnPageHide('user2', false)).toBe(false)
  })
})
