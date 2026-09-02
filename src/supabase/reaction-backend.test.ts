import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseReactionBackend } from './reaction-backend'

function fakeClient() {
  const calls: Array<{ op: string; value: unknown }> = []
  const client = {
    from(table: string) {
      calls.push({ op: 'table', value: table })
      return {
        select(columns: string) {
          calls.push({ op: 'select', value: columns })
          return {
            async in(column: string, values: string[]) {
              calls.push({ op: 'in', value: { column, values } })
              return {
                data: [{ message_id: 'm1', profile_id: 'p1', emoji: '❤️', updated_at: '1' }],
                error: null,
              }
            },
          }
        },
      }
    },
    async rpc(name: string, params: unknown) {
      calls.push({ op: 'rpc', value: { name, params } })
      return { data: { message_id: 'm1', profile_id: 'p1', emoji: '❤️', updated_at: '2' }, error: null }
    },
    channel(name: string) {
      calls.push({ op: 'channel', value: name })
      return {
        on(_kind: string, config: unknown, _callback: unknown) {
          calls.push({ op: 'on', value: config })
          return this
        },
        subscribe() { return this },
      }
    },
    async removeChannel() {},
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('Supabase reaction backend', () => {
  it('loads reactions for active message ids and sets heart with the existing RPC', async () => {
    const { client, calls } = fakeClient()
    const backend = createSupabaseReactionBackend(client)

    await expect(backend.load(['m1'])).resolves.toHaveLength(1)
    await expect(backend.set('m1', '❤️')).resolves.toMatchObject({ message_id: 'm1', emoji: '❤️' })

    expect(calls).toContainEqual({ op: 'table', value: 'chat_message_reactions' })
    expect(calls).toContainEqual({
      op: 'rpc',
      value: { name: 'chat_set_message_reaction', params: { p_message_id: 'm1', p_emoji: '❤️' } },
    })
  })

  it('subscribes to realtime changes on the existing reaction table', () => {
    const { client, calls } = fakeClient()
    const backend = createSupabaseReactionBackend(client)
    const dispose = backend.subscribe(() => {})
    dispose()

    expect(calls).toContainEqual({ op: 'channel', value: 'chat-message-reactions' })
    expect(calls).toContainEqual({
      op: 'on',
      value: { event: '*', schema: 'public', table: 'chat_message_reactions' },
    })
  })
})
