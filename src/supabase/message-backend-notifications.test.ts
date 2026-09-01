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

describe('Supabase message backend server-owned notifications', () => {
  it('persists the text message and leaves push ownership to the server', async () => {
    const rpc = vi.fn(async () => ({ data: MESSAGE, error: null }))
    const invoke = vi.fn(async () => ({ data: null, error: new Error('must_not_invoke_push') }))
    const client = { rpc, functions: { invoke } } as unknown as SupabaseClient
    const backend = createSupabaseMessageBackend(client)

    const result = await backend.sendText(MESSAGE.conversation_id, MESSAGE.client_message_id, MESSAGE.text)

    expect(result).toEqual(MESSAGE)
    expect(rpc).toHaveBeenCalledWith('chat_send_text_message', {
      p_conversation_id: MESSAGE.conversation_id,
      p_client_message_id: MESSAGE.client_message_id,
      p_text: MESSAGE.text,
      p_reply_to_id: null,
    })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('still surfaces a persistence failure', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('db_offline') }))
    const client = { rpc, functions: { invoke: vi.fn() } } as unknown as SupabaseClient
    const backend = createSupabaseMessageBackend(client)

    await expect(backend.sendText(MESSAGE.conversation_id, MESSAGE.client_message_id, MESSAGE.text))
      .rejects.toThrow('db_offline')
  })
})
