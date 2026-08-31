import { describe, expect, it } from 'vitest'
import { sessionToEvent } from './session-adapter'

describe('Supabase session adapter', () => {
  it('maps no session to the existing anonymous owner event', () => {
    expect(sessionToEvent(null)).toEqual({ type: 'RESTORE_ANONYMOUS' })
  })

  it('maps a Supabase session to the existing authenticated owner event', () => {
    expect(sessionToEvent({ user: { id: 'u1' }, expires_at: 123 })).toEqual({
      type: 'RESTORE_AUTHENTICATED',
      userId: 'u1',
      expiresAt: 123,
    })
  })
})
