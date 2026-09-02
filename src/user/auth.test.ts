import { describe, expect, it, vi } from 'vitest'
import {
  changeUser2Password,
  loginUser2,
  logoutUser2,
  normalizeUser2Profile,
  normalizeUser2Registration,
  normalizeUser2Username,
  updateUser2Profile,
  upgradeGuestToUser2,
} from './auth'

describe('User2 auth transitions', () => {
  it('normalizes TAPHOA username and rejects Admin on the root user page', () => {
    expect(normalizeUser2Username('  @KHACH_01 ')).toBe('khach_01')
    expect(() => normalizeUser2Username('admin')).toThrow('admin_uses_admin_page')
    expect(() => normalizeUser2Username('a')).toThrow('invalid_username')
  })

  it('validates User1 upgrade fields without changing their meaning', () => {
    expect(normalizeUser2Registration('  Nguyễn An  ', ' @Khach_01 ', '123456')).toEqual({
      displayName: 'Nguyễn An',
      username: 'khach_01',
      password: '123456',
    })
    expect(() => normalizeUser2Registration('', 'khach_01', '123456')).toThrow('invalid_display_name')
    expect(() => normalizeUser2Registration('A', 'admin', '123456')).toThrow('admin_uses_admin_page')
    expect(() => normalizeUser2Registration('A', 'khach_01', '12345')).toThrow('password_too_short')
  })

  it('normalizes User2 editable profile fields and updates them together', async () => {
    expect(normalizeUser2Profile('  Nguyễn An  ', ' @Khach_01 ')).toEqual({
      displayName: 'Nguyễn An',
      username: 'khach_01',
    })

    const update = vi.fn(async (input: { displayName: string; username: string }) => ({ ...input }))
    await expect(updateUser2Profile({ update }, ' Nguyễn An ', '@Khach_01')).resolves.toEqual({
      displayName: 'Nguyễn An',
      username: 'khach_01',
    })
    expect(update).toHaveBeenCalledWith({ displayName: 'Nguyễn An', username: 'khach_01' })
  })

  it('upgrades the current guest in place, persists User2 login, then clears only the guest auth session', async () => {
    const events: string[] = []
    const backend = {
      upgradeCurrentGuest: vi.fn(async (input: { displayName: string; username: string; password: string }) => {
        events.push(`upgrade:${input.displayName}:${input.username}`)
        return { loginUsername: input.username }
      }),
      signInPersistentUser2: vi.fn(async (email: string) => {
        events.push(`persist:${email}`)
      }),
      clearGuestAuthSession: vi.fn(async () => {
        events.push('clear-guest-auth')
      }),
    }

    await upgradeGuestToUser2(backend, ' Nguyễn An ', ' @Khach_01 ', '123456')

    expect(events).toEqual([
      'upgrade:Nguyễn An:khach_01',
      'persist:khach_01@taphoa.chat',
      'clear-guest-auth',
    ])
  })

  it('does not clear the guest auth session until persistent User2 sign-in succeeds', async () => {
    const clearGuestAuthSession = vi.fn(async () => {})
    await expect(upgradeGuestToUser2({
      upgradeCurrentGuest: vi.fn(async () => ({ loginUsername: 'khach_01' })),
      signInPersistentUser2: vi.fn(async () => { throw new Error('offline') }),
      clearGuestAuthSession,
    }, 'Nguyễn An', 'khach_01', '123456')).rejects.toThrow('offline')

    expect(clearGuestAuthSession).not.toHaveBeenCalled()
  })

  it('ends User1 before signing an existing User2 in', async () => {
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

  it('changes password only when confirmation matches and length is valid', async () => {
    const updatePassword = vi.fn(async () => {})

    await changeUser2Password({ updatePassword }, '654321', '654321')
    expect(updatePassword).toHaveBeenCalledWith('654321')

    await expect(changeUser2Password({ updatePassword }, '123456', '654321')).rejects.toThrow('password_mismatch')
    await expect(changeUser2Password({ updatePassword }, '12345', '12345')).rejects.toThrow('password_too_short')
  })
})
