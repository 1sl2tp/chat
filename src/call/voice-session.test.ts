import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceCallSession, callErrorMessage } from './voice-session'

const CALL_ID = '33333333-3333-4333-8333-333333333333'
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444'
const PROFILE_ID = '55555555-5555-4555-8555-555555555555'
const DEVICE_ID = '66666666-6666-4666-8666-666666666666'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VoiceCallSession busy outcomes', () => {
  it.each([
    ['caller_busy', 'Bạn đang có cuộc gọi khác'],
    ['peer_busy', 'Đối phương đang trong cuộc gọi'],
    ['call_already_active', 'Cuộc gọi đã tồn tại'],
  ])('maps %s to user-facing copy', (reason, expected) => {
    expect(callErrorMessage(reason)).toBe(expected)
  })

  it('does not join LiveKit when start RPC returns a busy result with an existing call id', async () => {
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('navigator', { userAgent: 'test', vibrate: vi.fn(() => false) })

    const rpc = vi.fn(async (name: string) => {
      if (name === 'chat_start_voice_call') {
        return { data: { ok: false, reason: 'peer_busy', call_id: CALL_ID }, error: null }
      }
      return { data: null, error: null }
    })
    const invoke = vi.fn(async () => ({ data: null, error: new Error('must_not_join') }))
    const client = { rpc, functions: { invoke } } as unknown as SupabaseClient
    const session = new VoiceCallSession(client, () => ({
      profileId: PROFILE_ID,
      deviceId: DEVICE_ID,
      conversationId: CONVERSATION_ID,
      peerName: 'Admin',
    }))

    await session.startOutgoing()

    expect(session.getState().phase).toBe('error')
    expect(session.getState().error).toBe('Đối phương đang trong cuộc gọi')
    expect(invoke).not.toHaveBeenCalled()

    session.dismissError()
    expect(session.getState().phase).toBe('idle')
  })
})
