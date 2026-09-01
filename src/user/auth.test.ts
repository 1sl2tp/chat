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
      signInUser2: vi.fn(async (email: string) => { events.push(`sign-in:${email}`) }),
      signOutUser2: vi.fn(async () => { events.push('sign-out-user2') }),
    }

    await loginUser2(backend, 'Khach_01', '123456')

    expect(events).toEqual([
      'end-guest',
      'sign-in:khach_01@taphoa.chat',
    ])
  })

  it('signs User2 out before a caller starts a new guest', async () => {
    const events: string[] = []
    const backend = {
      endGuestSession: vi.fn(async () => { events.push('end-guest') }),
      signInUser2: vi.fn(async () => { events.push('sign-in') }),
      signOutUser2: vi.fn(async () => { events.push('sign-out-user2') }),
    }

    await logoutUser2(backend)

    expect(events).toEqual(['sign-out-user2'])
  })
})
