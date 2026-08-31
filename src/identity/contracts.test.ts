import { describe, expect, it } from 'vitest'
import { decodeResolvedIdentity } from './contracts'

describe('resolved identity contract', () => {
  it('decodes an admin identity payload', () => {
    expect(decodeResolvedIdentity({
      kind: 'admin',
      profile_id: 'p1',
      auth_user_id: 'u1',
      is_admin: true,
    })).toEqual({ kind: 'admin', profileId: 'p1', authUserId: 'u1', isAdmin: true })
  })

  it('rejects unknown roles instead of silently becoming guest', () => {
    expect(() => decodeResolvedIdentity({
      kind: 'mystery',
      profile_id: 'p1',
      auth_user_id: 'u1',
      is_admin: false,
    })).toThrow('invalid_identity_kind')
  })
})
