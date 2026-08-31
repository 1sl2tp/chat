import { describe, expect, it } from 'vitest'
import { decideSurface } from './startup'

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
    expect(decideSurface('/', { kind: 'admin', profileId: 'pa', authUserId: 'ua', isAdmin: true }))
      .toEqual({ type: 'access-denied' })
  })

  it('denies customers from admin workspace', () => {
    expect(decideSurface('/admin', { kind: 'guest_customer', profileId: 'p1', authUserId: 'u1', isAdmin: false }))
      .toEqual({ type: 'access-denied' })
    expect(decideSurface('/admin', { kind: 'registered_customer', profileId: 'p2', authUserId: 'u2', isAdmin: false }))
      .toEqual({ type: 'access-denied' })
  })

  it('opens admin workspace only for admin identity', () => {
    expect(decideSurface('/admin', { kind: 'admin', profileId: 'pa', authUserId: 'ua', isAdmin: true }))
      .toEqual({ type: 'admin-workspace' })
  })
})
