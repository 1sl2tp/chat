import { describe, expect, it } from 'vitest'
import { INITIAL_SESSION_STATE, reduceSession } from './state'

describe('session lifecycle', () => {
  it('restores, refreshes, expires and signs out deterministically', () => {
    const authenticated = reduceSession(INITIAL_SESSION_STATE, { type: 'RESTORE_AUTHENTICATED', userId: 'u1', expiresAt: 123 })
    expect(authenticated.phase).toBe('authenticated')
    expect(reduceSession(authenticated, { type: 'REFRESH_START' }).phase).toBe('refreshing')
    expect(reduceSession(authenticated, { type: 'EXPIRE' }).phase).toBe('expired')
    expect(reduceSession(authenticated, { type: 'SIGN_OUT' })).toEqual({ phase: 'signed-out', userId: null, expiresAt: null })
  })
})
