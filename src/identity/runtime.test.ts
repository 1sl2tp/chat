import { describe, expect, it } from 'vitest'
import { getIdentityState } from './store'
import { resetIdentity, resolveIdentity } from './runtime'

describe('identity runtime', () => {
  it('resolves backend identity into canonical owner state', async () => {
    const identity = { kind: 'guest_customer' as const, profileId: 'p1', authUserId: 'u1', isAdmin: false }
    const result = await resolveIdentity({ resolveCurrentIdentity: async () => identity })
    expect(result).toEqual(identity)
    expect(getIdentityState()).toEqual({ phase: 'ready', identity, error: null })
  })

  it('records errors and can reset', async () => {
    await expect(resolveIdentity({ resolveCurrentIdentity: async () => { throw new Error('identity_unresolved') } }))
      .rejects.toThrow('identity_unresolved')
    expect(getIdentityState().phase).toBe('error')
    resetIdentity()
    expect(getIdentityState()).toEqual({ phase: 'idle', identity: null, error: null })
  })
})
