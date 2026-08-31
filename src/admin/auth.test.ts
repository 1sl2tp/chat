import { describe, expect, it, vi } from 'vitest'
import { normalizeAdminLogin, signInAdmin } from './auth'

describe('admin auth', () => {
  it('maps the short admin login to the Admin email', () => {
    expect(normalizeAdminLogin('admin')).toBe('admin@taphoa.chat')
    expect(normalizeAdminLogin('ADMIN')).toBe('admin@taphoa.chat')
    expect(normalizeAdminLogin('admin@taphoa.chat')).toBe('admin@taphoa.chat')
  })

  it('signs in with the isolated Admin auth backend', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    await signInAdmin({ signIn }, 'admin', 'secret')
    expect(signIn).toHaveBeenCalledWith('admin@taphoa.chat', 'secret')
  })
})
