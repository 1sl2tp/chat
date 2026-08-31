import { describe, expect, it } from 'vitest'
import { decideSurface, resolveStartupSurface } from './startup'

const adminIdentity = { kind: 'admin', profileId: 'pa', authUserId: 'ua', isAdmin: true } as const

describe('app startup surface policy', () => {
  it('sends admin route without session to admin login', () => {
    expect(decideSurface('/admin', null)).toEqual({ type: 'admin-login' })
  })

  it('allows guest and registered customers on customer route', () => {
    expect(decideSurface('/', { kind: 'guest_customer', profileId: 'p1', authUserId: 'u1', isAdmin: false }))
      .toEqual({ type: 'guest-chat' })
    expect(decideSurface('/', { kind: 'registered_customer', profileId: 'p2', authUserId: 'u2', isAdmin: false }))
      .toEqual({ type: 'customer-chat' })
  })

  it('never reinterprets admin as a customer', () => {
    expect(decideSurface('/', adminIdentity)).toEqual({ type: 'access-denied' })
  })

  it('denies customers from admin workspace', () => {
    expect(decideSurface('/admin', { kind: 'guest_customer', profileId: 'p1', authUserId: 'u1', isAdmin: false }))
      .toEqual({ type: 'access-denied' })
    expect(decideSurface('/admin', { kind: 'registered_customer', profileId: 'p2', authUserId: 'u2', isAdmin: false }))
      .toEqual({ type: 'access-denied' })
  })

  it('passes canonical admin identity into the admin workspace boundary', () => {
    expect(decideSurface('/admin', adminIdentity))
      .toEqual({ type: 'admin-workspace', identity: adminIdentity })
  })

  it('creates an anonymous session only for customer startup without a session', async () => {
    const calls: string[] = []
    const surface = await resolveStartupSurface('/', {
      async hasSession() { calls.push('session'); return false },
      async signInAnonymously() { calls.push('anonymous') },
      async resolveIdentity() {
        calls.push('identity')
        return { kind: 'guest_customer', profileId: 'p1', authUserId: 'u1', isAdmin: false }
      },
    })
    expect(calls).toEqual(['session', 'anonymous', 'identity'])
    expect(surface).toEqual({ type: 'guest-chat' })
  })

  it('never creates anonymous session for admin route', async () => {
    const calls: string[] = []
    const surface = await resolveStartupSurface('/admin', {
      async hasSession() { calls.push('session'); return false },
      async signInAnonymously() { calls.push('anonymous') },
      async resolveIdentity() { throw new Error('should_not_resolve') },
    })
    expect(calls).toEqual(['session'])
    expect(surface).toEqual({ type: 'admin-login' })
  })
})
