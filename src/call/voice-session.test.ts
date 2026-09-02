import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceCallSession, callErrorMessage } from './voice-session'

const CALL_ID = '33333333-3333-4333-8333-333333333333'
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444'
const PROFILE_ID = '55555555-5555-4555-8555-555555555555'
const DEVICE_ID = '66666666-6666-4666-8666-666666666666'
const OTHER_DEVICE_ID = '99999999-9999-4999-8999-999999999999'
const CALL_ROW = {
  id: CALL_ID,
  conversation_id: CONVERSATION_ID,
  caller_profile_id: '77777777-7777-4777-8777-777777777777',
  callee_profile_id: PROFILE_ID,
  caller_device_id: '88888888-8888-4888-8888-888888888888',
  accepted_device_id: null,
  state: 'ringing',
  connected_at: null,
  caller_display_name: 'Admin',
  callee_display_name: 'User',
}

afterEach(() => {
  vi.useRealTimers()
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

describe('VoiceCallSession device ownership', () => {
  it('does not restore or join a call answered by another device of the same callee profile', async () => {
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('navigator', { userAgent: 'test', vibrate: vi.fn(() => false) })

    const answeredElsewhere = {
      ...CALL_ROW,
      state: 'accepted',
      accepted_device_id: OTHER_DEVICE_ID,
    }
    const rpc = vi.fn(async (name: string) => {
      if (name === 'chat_get_active_voice_calls') return { data: [answeredElsewhere], error: null }
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

    await (session as unknown as { pollActiveCalls(): Promise<void> }).pollActiveCalls()

    expect(session.getState().phase).toBe('idle')
    expect(session.getState().callId).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('VoiceCallSession incoming alert lifecycle', () => {
  function setupIncomingSession(rpc: ReturnType<typeof vi.fn>) {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('navigator', { userAgent: 'test', vibrate: vi.fn(() => false) })
    const client = { rpc, functions: { invoke: vi.fn() } } as unknown as SupabaseClient
    const session = new VoiceCallSession(client, () => ({
      profileId: PROFILE_ID,
      deviceId: DEVICE_ID,
      conversationId: CONVERSATION_ID,
      peerName: 'Admin',
    }))
    return { session, client }
  }

  async function revealIncoming(session: VoiceCallSession): Promise<void> {
    await (session as unknown as { pollActiveCalls(): Promise<void> }).pollActiveCalls()
    expect(session.getState().phase).toBe('incoming')
  }

  it('leaves incoming phase immediately when answer is tapped, before accept RPC resolves', async () => {
    let resolveAccept!: (value: { data: null; error: Error }) => void
    const pendingAccept = new Promise<{ data: null; error: Error }>((resolve) => { resolveAccept = resolve })
    const rpc = vi.fn((name: string) => {
      if (name === 'chat_get_active_voice_calls') return Promise.resolve({ data: [CALL_ROW], error: null })
      if (name === 'chat_accept_voice_call') return pendingAccept
      return Promise.resolve({ data: null, error: null })
    })
    const { session } = setupIncomingSession(rpc)
    await revealIncoming(session)

    const acceptTask = session.accept()

    expect(session.getState().phase).toBe('connecting')
    resolveAccept({ data: null, error: new Error('stop_after_timing_assertion') })
    await acceptTask
  })

  it('returns to idle immediately when decline is tapped, before decline RPC resolves', async () => {
    let resolveDecline!: (value: { data: null; error: null }) => void
    const pendingDecline = new Promise<{ data: null; error: null }>((resolve) => { resolveDecline = resolve })
    const rpc = vi.fn((name: string) => {
      if (name === 'chat_get_active_voice_calls') return Promise.resolve({ data: [CALL_ROW], error: null })
      if (name === 'chat_decline_voice_call') return pendingDecline
      return Promise.resolve({ data: null, error: null })
    })
    const { session } = setupIncomingSession(rpc)
    await revealIncoming(session)

    const declineTask = session.decline()

    expect(session.getState().phase).toBe('idle')
    resolveDecline({ data: null, error: null })
    await declineTask
  })
})
