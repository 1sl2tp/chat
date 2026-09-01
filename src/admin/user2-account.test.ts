import { describe, expect, it, vi } from 'vitest'
import { createUser2FromAdmin, normalizeNewUser2 } from './user2-account'

describe('Admin User2 creation', () => {
  it('normalizes username and rejects reserved Admin', () => {
    expect(normalizeNewUser2('  @KHACH_02 ', 'secret123')).toEqual({
      username: 'khach_02',
      password: 'secret123',
    })
    expect(() => normalizeNewUser2('admin', 'secret123')).toThrow('reserved_username')
    expect(() => normalizeNewUser2('ab', 'secret123')).toThrow('invalid_username')
    expect(() => normalizeNewUser2('khach_02', '123')).toThrow('password_too_short')
  })

  it('sends only normalized username and password to the protected server action', async () => {
    const create = vi.fn(async () => ({ username: 'khach_02' }))

    const result = await createUser2FromAdmin({ create }, ' @KHACH_02 ', 'secret123')

    expect(create).toHaveBeenCalledWith({ username: 'khach_02', password: 'secret123' })
    expect(result).toEqual({ username: 'khach_02' })
  })
})
