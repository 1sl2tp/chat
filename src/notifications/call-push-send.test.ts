import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { sendIncomingCallPush } from './call-push-send'

const CALL_ID = '22222222-2222-4222-8222-222222222222'

describe('sendIncomingCallPush', () => {
  it('invokes the existing sender with the new call id', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, delivered: 1 }, error: null }))
    const client = { functions: { invoke } } as unknown as SupabaseClient

    await sendIncomingCallPush(client, CALL_ID)

    expect(invoke).toHaveBeenCalledWith('taphoaxyz-call-push', {
      body: { action: 'send', call_id: CALL_ID },
    })
  })

  it('throws when the Edge Function invoke fails', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: new Error('push_failed') }))
    const client = { functions: { invoke } } as unknown as SupabaseClient

    await expect(sendIncomingCallPush(client, CALL_ID)).rejects.toThrow('push_failed')
  })
})
