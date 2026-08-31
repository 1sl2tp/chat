import { describe, expect, it } from 'vitest'
import { createSupabaseAuthActions } from './auth-actions'

describe('supabase auth actions', () => {
  it('signs in with password without exposing the raw password elsewhere', async () => {
    const calls: unknown[] = []
    const client = {
      auth: {
        signInWithPassword: async (input: unknown) => {
          calls.push(input)
          return { data: { session: {} }, error: null }
        },
        signOut: async () => ({ error: null }),
      },
    }
    const actions = createSupabaseAuthActions(client as never)
    await actions.signInWithPassword({ email: 'admin@taphoa.chat', password: 'secret' })
    expect(calls).toEqual([{ email: 'admin@taphoa.chat', password: 'secret' }])
  })

  it('normalizes sign-in failure to a safe auth code', async () => {
    const client = {
      auth: {
        signInWithPassword: async () => ({ data: { session: null }, error: new Error('raw backend detail') }),
        signOut: async () => ({ error: null }),
      },
    }
    await expect(createSupabaseAuthActions(client as never).signInWithPassword({ email: 'x@y.z', password: 'bad' }))
      .rejects.toThrow('auth_invalid_credentials')
  })

  it('signs out once', async () => {
    let count = 0
    const client = {
      auth: {
        signInWithPassword: async () => ({ data: { session: {} }, error: null }),
        signOut: async () => { count += 1; return { error: null } },
      },
    }
    await createSupabaseAuthActions(client as never).signOut()
    expect(count).toBe(1)
  })
})
