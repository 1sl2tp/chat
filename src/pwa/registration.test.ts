import { describe, expect, it } from 'vitest'
import { pwaRegistrationDescriptor } from './registration'

describe('PWA registration ownership', () => {
  it('uses distinct Service Worker scopes for User and Admin on one machine', () => {
    expect(pwaRegistrationDescriptor('user')).toEqual({ scriptUrl: '/sw.js', scope: '/' })
    expect(pwaRegistrationDescriptor('admin')).toEqual({ scriptUrl: '/sw.js', scope: '/admin/' })
  })
})
