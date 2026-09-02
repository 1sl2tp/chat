import { describe, expect, it, vi } from 'vitest'
import {
  createUser2FromAdmin,
  createUser2WithDisplayNameFromAdmin,
  deleteUserFromAdmin,
  normalizeAdminUser2Registration,
  normalizeNewUser2,
  resetUser2PasswordFromAdmin,
  updateUser2FromAdmin,
  upgradeGuestFromAdmin,
} from './user2-account'

describe('Admin User management', () => {
  it('keeps the legacy username/password normalizer compatible', () => {
    expect(normalizeNewUser2('  @KHACH_02 ', 'secret123')).toEqual({
      username: 'khach_02',
      password: 'secret123',
    })
    expect(() => normalizeNewUser2('admin', 'secret123')).toThrow('reserved_username')
    expect(() => normalizeNewUser2('ab', 'secret123')).toThrow('invalid_username')
    expect(() => normalizeNewUser2('khach_02', '123')).toThrow('password_too_short')
  })

  it('validates display name + account + password for managed User2 creation', () => {
    expect(normalizeAdminUser2Registration('  Nguyễn An ', ' @KHACH_02 ', 'secret123')).toEqual({
      displayName: 'Nguyễn An',
      username: 'khach_02',
      password: 'secret123',
    })
    expect(() => normalizeAdminUser2Registration('', 'khach_02', 'secret123')).toThrow('invalid_display_name')
  })

  it('keeps the existing create adapter working', async () => {
    const create = vi.fn(async () => ({ username: 'khach_02' }))
    const result = await createUser2FromAdmin({ create }, ' @KHACH_02 ', 'secret123')
    expect(create).toHaveBeenCalledWith({ username: 'khach_02', password: 'secret123' })
    expect(result).toEqual({ username: 'khach_02' })
  })

  it('creates User2 with display name through the new management adapter', async () => {
    const create = vi.fn(async (input: { displayName: string; username: string; password: string }) => ({
      displayName: input.displayName,
      username: input.username,
    }))
    await createUser2WithDisplayNameFromAdmin({ create }, ' Nguyễn An ', '@KHACH_02', 'secret123')
    expect(create).toHaveBeenCalledWith({ displayName: 'Nguyễn An', username: 'khach_02', password: 'secret123' })
  })

  it('upgrades the selected guest in place', async () => {
    const upgrade = vi.fn(async () => ({ username: 'khach_02' }))
    await upgradeGuestFromAdmin({ upgrade }, '11111111-1111-4111-8111-111111111111', 'Nguyễn An', 'khach_02', 'secret123')
    expect(upgrade).toHaveBeenCalledWith({
      profileId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Nguyễn An',
      username: 'khach_02',
      password: 'secret123',
    })
  })

  it('updates User2 name/account and resets password separately', async () => {
    const update = vi.fn(async () => ({ username: 'khach_03' }))
    const resetPassword = vi.fn(async () => {})
    await updateUser2FromAdmin({ update }, '11111111-1111-4111-8111-111111111111', 'Nguyễn B', '@KHACH_03')
    await resetUser2PasswordFromAdmin({ resetPassword }, '11111111-1111-4111-8111-111111111111', 'newpass1', 'newpass1')
    expect(update).toHaveBeenCalledWith({
      profileId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Nguyễn B',
      username: 'khach_03',
    })
    expect(resetPassword).toHaveBeenCalledWith({
      profileId: '11111111-1111-4111-8111-111111111111',
      password: 'newpass1',
    })
  })

  it('requires explicit backend delete for a valid profile id', async () => {
    const deleteUser = vi.fn(async () => {})
    await deleteUserFromAdmin({ deleteUser }, '11111111-1111-4111-8111-111111111111')
    expect(deleteUser).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    await expect(deleteUserFromAdmin({ deleteUser }, 'not-a-uuid')).rejects.toThrow('invalid_profile_id')
  })
})
