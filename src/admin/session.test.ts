import { describe, expect, it, vi } from 'vitest'
import { logoutAdmin } from './session'

describe('Admin owner logout', () => {
  it('cleans Admin Push and server session before Auth sign-out', async () => {
    const events: string[] = []

    await logoutAdmin({
      async unsubscribePush() { events.push('unsubscribe-push') },
      async endAdminSession() { events.push('end-admin-session') },
      async signOutAdmin() { events.push('sign-out-admin') },
    })

    expect(events).toEqual([
      'unsubscribe-push',
      'end-admin-session',
      'sign-out-admin',
    ])
  })

  it('still signs Admin out when Push or server cleanup fails', async () => {
    const signOutAdmin = vi.fn(async () => undefined)

    await expect(logoutAdmin({
      async unsubscribePush() { throw new Error('push_cleanup_failed') },
      async endAdminSession() { throw new Error('server_cleanup_failed') },
      signOutAdmin,
    })).resolves.toBeUndefined()

    expect(signOutAdmin).toHaveBeenCalledOnce()
  })
})
