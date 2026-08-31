import { describe, expect, it } from 'vitest'
import { INITIAL_IDENTITY_STATE, reduceIdentity } from './state'

const admin = { kind: 'admin' as const, profileId: 'p1', authUserId: 'u1', isAdmin: true }

describe('identity state', () => {
  it('moves resolving to ready', () => {
    expect(reduceIdentity({ ...INITIAL_IDENTITY_STATE, phase: 'resolving' }, { type: 'RESOLVE_SUCCESS', identity: admin }))
      .toEqual({ phase: 'ready', identity: admin, error: null })
  })

  it('records resolution error', () => {
    expect(reduceIdentity({ ...INITIAL_IDENTITY_STATE, phase: 'resolving' }, { type: 'RESOLVE_ERROR', error: 'identity_unresolved' }))
      .toEqual({ phase: 'error', identity: null, error: 'identity_unresolved' })
  })

  it('resets to idle', () => {
    expect(reduceIdentity({ phase: 'ready', identity: admin, error: null }, { type: 'RESET' })).toEqual(INITIAL_IDENTITY_STATE)
  })
})
