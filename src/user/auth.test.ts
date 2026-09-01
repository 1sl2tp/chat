import { describe, expect, it, vi } from 'vitest'
import { loginUser2, logoutUser2, normalizeUser2Username } from './auth'

describe('User2 auth transitions', () => {
  it('normalizes TAPHOA username and rejects Admin on the root user page', () => {
    expect(normalizeUser2Username('  @KHACH_01 ')).toBe('khach_01')
    expect(() => normalizeUser2Username('admin')).toThrow('admin_uses_admin_page')
    expect(() => normalizeUser2Username('a')).toThrow('invalid_username')
  })

  it('ends User1 before signing User2 in', async () => {
    const events: string[] = []
    const backend = {
      endGuestSession: vi.fn(async () => { events.push('end-guest') }),
      endUser2Session: vi.fn(async () => { events.push('end-user2') }),
      signInUser2: vi.fn(async (email: string) => { events.push(`sign-in:${email}`) }),
      signOutUser2: vi.fn(async () => { events.push('sign-out-user2') }),
    }

    await loginUser2(backend, 'Khach_01', '123456')

    expect(events).toEqual([
      'end-guest',
      'sign-in:khach_01@taphoa.chat',
    ])
  })

  it('ends the live User2 server session before signing Auth out', async () => {
    const events: string[] = []
    const backend = {
      endGuestSession: vi.fn(async () => { events.push('end-guest') }),
      endUser2Session: vi.fn(async () => { events.push('end-user2') }),
      signInUser2: vi.fn(async () => { events.push('sign-in') }),
      signOutUser2: vi.fn(async () => { events.push('sign-out-user2') }),
    }

    await logoutUser2(backend)

    expect(events).toEqual(['end-user2', 'sign-out-user2'])
  })

  it('still signs Auth out if server session cleanup fails', async () => {
    const events: string[] = []
    const backend = {
      endGuestSession: vi.fn(async () => {}),
      endUser2Session: vi.fn(async () => {
        events.push('end-user2')
        throw new Error('offline')
      }),
      signInUser2: vi.fn(async () => {}),
      signOutUser2: vi.fn(async () => { events.push('sign-out-user2') }),
    }

    await logoutUser2(backend)

    expect(events).toEqual(['end-user2', 'sign-out-user2'])
  })
})
