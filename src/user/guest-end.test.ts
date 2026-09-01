import { describe, expect, it, vi } from 'vitest'
import { endGuestSession } from './guest-lifecycle'

describe('endGuestSession', () => {
  it('ends server guest data before signing out and always clears local guest keys', async () => {
    const events: string[] = []
    const storage = { removeItem: vi.fn((key: string) => events.push(`clear:${key}`)) }

    await endGuestSession({
      async endRemoteGuest() { events.push('remote') },
      async signOutGuest() { events.push('signout') },
    }, storage)

    expect(events[0]).toBe('remote')
    expect(events[1]).toBe('signout')
    expect(events.filter((event) => event.startsWith('clear:'))).toHaveLength(2)
  })

  it('still signs out and clears local guest keys when remote cleanup fails', async () => {
    const events: string[] = []
    const storage = { removeItem: vi.fn((key: string) => events.push(`clear:${key}`)) }

    await expect(endGuestSession({
      async endRemoteGuest() { events.push('remote'); throw new Error('offline') },
      async signOutGuest() { events.push('signout') },
    }, storage)).resolves.toBeUndefined()

    expect(events).toContain('signout')
    expect(events.filter((event) => event.startsWith('clear:'))).toHaveLength(2)
  })
})
