import { describe, expect, it } from 'vitest'
import { requestNotificationPermissionOnce } from './notifications'

describe('notification permission policy', () => {
  it('requests once only while permission is undecided', async () => {
    let calls = 0
    const api = {
      permission: 'default' as NotificationPermission,
      async requestPermission() {
        calls += 1
        this.permission = 'granted'
        return this.permission
      },
    }

    const first = await requestNotificationPermissionOnce(api)
    const second = await requestNotificationPermissionOnce(api)

    expect(first.requested).toBe(true)
    expect(first.after).toBe('granted')
    expect(second.requested).toBe(false)
    expect(calls).toBe(1)
  })

  it('never retries a denied permission', async () => {
    let calls = 0
    const api = {
      permission: 'denied' as NotificationPermission,
      async requestPermission() {
        calls += 1
        return this.permission
      },
    }

    const result = await requestNotificationPermissionOnce(api)

    expect(result.requested).toBe(false)
    expect(result.after).toBe('denied')
    expect(calls).toBe(0)
  })
})
