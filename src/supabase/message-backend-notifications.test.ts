import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseMessageBackend } from './message-backend'

const MESSAGE = {
  id: '22222222-2222-4222-8222-222222222222',
  conversation_id: '33333333-3333-4333-8333-333333333333',
  sender_id: '44444444-4444-4444-8444-444444444444',
  client_message_id: 'client-message-1',
  type: 'text',
  text: 'Xin chào',
  reply_to_id: null,
  created_at: '2026-09-01T06:00:00Z',
  edited_at: null,
  revoked_at: null,
  call_id: null,
}

describe('Supabase message backend notification dispatch', () => {
  it('dispatches push after the text message is saved', async () => {
    const rpc = vi.fn(async () => ({ data: MESSAGE, error: null }))
    const invoke = vi.fn(async () => ({ data: { ok: true, delivered: 1 }, error: null }))
    const client = { rpc, functions: { invoke } } as unknown as SupabaseClient
    const backend = createSupabaseMessageBackend(client)

    const result = await backend.sendText(MESSAGE.conversation_id, MESSAGE.client_message_id, MESSAGE.text)
    await Promise.resolve()

    expect(result.id).toBe(MESSAGE.id)
    expect(invoke).toHaveBeenCalledWith('taphoaxyz-call-push', {
      body: { action: 'send_message', message_id: MESSAGE.id },
    })
  })

  it('does not turn a push failure into a chat-send failure', async () => {
    const rpc = vi.fn(async () => ({ data: MESSAGE, error: null }))
    const invoke = vi.fn(async () => ({ data: null, error: new Error('push_offline') }))
    const client = { rpc, functions: { invoke } } as unknown as SupabaseClient
    const backend = createSupabaseMessageBackend(client)

    await expect(backend.sendText(MESSAGE.conversation_id, MESSAGE.client_message_id, MESSAGE.text)).resolves.toEqual(MESSAGE)
    await Promise.resolve()

    expect(invoke).toHaveBeenCalledOnce()
  })
})
