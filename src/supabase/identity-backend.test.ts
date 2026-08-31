import { describe, expect, it } from 'vitest'
import { createSupabaseIdentityBackend } from './identity-backend'

describe('supabase identity backend', () => {
  it('calls chat_resolve_identity and decodes the result', async () => {
    const calls: string[] = []
    const client = {
      rpc: async (name: string) => {
        calls.push(name)
        return {
          data: { kind: 'registered_customer', profile_id: 'p2', auth_user_id: 'u2', is_admin: false },
          error: null,
        }
      },
    }

    const identity = await createSupabaseIdentityBackend(client as never).resolveCurrentIdentity()

    expect(calls).toEqual(['chat_resolve_identity'])
    expect(identity).toEqual({
      kind: 'registered_customer',
      profileId: 'p2',
      authUserId: 'u2',
      isAdmin: false,
    })
  })
})
