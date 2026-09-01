import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { sendChatMessagePush } from './chat-push-send'

const MESSAGE_ID = '22222222-2222-4222-8222-222222222222'

describe('sendChatMessagePush', () => {
  it('uses the existing push sender with the saved message id', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, delivered: 1 }, error: null }))
    const client = { functions: { invoke } } as unknown as SupabaseClient

    await sendChatMessagePush(client, MESSAGE_ID)

    expect(invoke).toHaveBeenCalledWith('taphoaxyz-call-push', {
      body: { action: 'send_message', message_id: MESSAGE_ID },
    })
  })

  it('surfaces Edge Function failures to its caller', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: new Error('chat_push_failed') }))
    const client = { functions: { invoke } } as unknown as SupabaseClient

    await expect(sendChatMessagePush(client, MESSAGE_ID)).rejects.toThrow('chat_push_failed')
  })
})
