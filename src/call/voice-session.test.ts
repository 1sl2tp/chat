import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceCallSession, callErrorMessage, type VoiceCallContext, type VoiceCallState } from './voice-session'

const CALL_ID = '33333333-3333-4333-8333-333333333333'
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444'
const PROFILE_ID = '55555555-5555-4555-8555-555555555555'
const DEVICE_ID = '66666666-6666-4666-8666-666666666666'
const OTHER_DEVICE_ID = '99999999-9999-4999-8999-999999999999'
const CONTEXT: VoiceCallContext = {
  profileId: PROFILE_ID,
  deviceId: DEVICE_ID,
  conversationId: CONVERSATION_ID,
  peerName: 'Admin',
}
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
    const session = new VoiceCallSession(client, () => CONTEXT)

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
    const session = new VoiceCallSession(client, () => CONTEXT)

    await (session as unknown as { pollActiveCalls(): Promise<void> }).pollActiveCalls()

    expect(session.getState().phase).toBe('idle')
    expect(session.getState().callId).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('restores a connected call as waiting for a fresh user gesture instead of auto-joining without a microphone', async () => {
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('navigator', { userAgent: 'test', vibrate: vi.fn(() => false) })

    const connectedOnThisDevice = {
      ...CALL_ROW,
      state: 'connected',
      accepted_device_id: DEVICE_ID,
      connected_at: '2026-09-02T03:00:00.000Z',
    }
    const rpc = vi.fn(async (name: string) => {
      if (name === 'chat_get_active_voice_calls') return { data: [connectedOnThisDevice], error: null }
      return { data: null, error: null }
    })
    const invoke = vi.fn(async () => ({ data: null, error: new Error('must_wait_for_user_gesture') }))
    const client = { rpc, functions: { invoke } } as unknown as SupabaseClient
    const session = new VoiceCallSession(client, () => CONTEXT)

    await (session as unknown as { pollActiveCalls(): Promise<void> }).pollActiveCalls()
    await Promise.resolve()

    const restored = session.getState()
    expect(restored.phase).toBe('reconnecting')
    expect(restored.callId).toBe(CALL_ID)
    expect(restored.connectedAt).toBe(Date.parse(connectedOnThisDevice.connected_at))
    expect(restored.resumeRequired).toBe(true)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('also waits for a fresh user gesture when the caller reloads while the peer is still ringing', async () => {
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('navigator', { userAgent: 'test', vibrate: vi.fn(() => false) })

    const outgoingRinging = {
      ...CALL_ROW,
      caller_profile_id: PROFILE_ID,
      callee_profile_id: '77777777-7777-4777-8777-777777777777',
      caller_device_id: DEVICE_ID,
      caller_display_name: 'User',
      callee_display_name: 'Admin',
    }
    const rpc = vi.fn(async (name: string) => {
      if (name === 'chat_get_active_voice_calls') return { data: [outgoingRinging], error: null }
      return { data: null, error: null }
    })
    const invoke = vi.fn(async () => ({ data: null, error: new Error('must_wait_for_user_gesture') }))
    const client = { rpc, functions: { invoke } } as unknown as SupabaseClient
    const session = new VoiceCallSession(client, () => CONTEXT)

    await (session as unknown as { pollActiveCalls(): Promise<void> }).pollActiveCalls()
    await Promise.resolve()

    expect(session.getState().phase).toBe('outgoing')
    expect(session.getState().callId).toBe(CALL_ID)
    expect(session.getState().resumeRequired).toBe(true)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('restarts microphone capture from the resume button gesture before rejoining LiveKit', async () => {
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('navigator', { userAgent: 'test', vibrate: vi.fn(() => false) })

    const connectedOnThisDevice = {
      ...CALL_ROW,
      state: 'connected',
      accepted_device_id: DEVICE_ID,
      connected_at: '2026-09-02T03:00:00.000Z',
    }
    const rpc = vi.fn(async (name: string) => {
      if (name === 'chat_get_active_voice_calls') return { data: [connectedOnThisDevice], error: null }
      return { data: null, error: null }
    })
    const client = { rpc, functions: { invoke: vi.fn() } } as unknown as SupabaseClient
    const session = new VoiceCallSession(client, () => CONTEXT)
    await (session as unknown as { pollActiveCalls(): Promise<void> }).pollActiveCalls()

    const internals = session as unknown as {
      media: { beginUserGesture(): void }
      joinLiveKit(callId: string, context: VoiceCallContext): Promise<void>
      resumeFromUserGesture(): Promise<void>
    }
    const beginUserGesture = vi.spyOn(internals.media, 'beginUserGesture').mockImplementation(() => undefined)
    const joinLiveKit = vi.spyOn(internals, 'joinLiveKit').mockResolvedValue(undefined)

    await internals.resumeFromUserGesture()

    expect(beginUserGesture).toHaveBeenCalledOnce()
    expect(joinLiveKit).toHaveBeenCalledWith(CALL_ID, CONTEXT)
    expect(beginUserGesture.mock.invocationCallOrder[0]).toBeLessThan(joinLiveKit.mock.invocationCallOrder[0] ?? Infinity)
  })
})

describe('VoiceCallSession incoming alert lifecycle', () => {
  function setupIncomingSession(rpc: ReturnType<typeof vi.fn>) {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('navigator', { userAgent: 'test', vibrate: vi.fn(() => false) })
    const client = { rpc, functions: { invoke: vi.fn() } } as unknown as SupabaseClient
    const session = new VoiceCallSession(client, () => CONTEXT)
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
