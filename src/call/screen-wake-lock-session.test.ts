import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceCallSession, type VoiceCallContext } from './voice-session'

const CALL_ID = '33333333-3333-4333-8333-333333333333'
const CONTEXT: VoiceCallContext = {
  profileId: '55555555-5555-4555-8555-555555555555',
  deviceId: '66666666-6666-4666-8666-666666666666',
  conversationId: '44444444-4444-4444-8444-444444444444',
  peerName: 'Admin',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VoiceCallSession screen wake lock', () => {
  it('keeps the screen awake while a call is in progress and releases it when the call ends', async () => {
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('document', { visibilityState: 'visible' })

    const release = vi.fn(async () => undefined)
    const request = vi.fn(async () => ({ release, addEventListener: vi.fn() }))
    vi.stubGlobal('navigator', {
      userAgent: 'test',
      vibrate: vi.fn(() => false),
      wakeLock: { request },
    })

    let resolveStart!: (value: { data: { ok: false; reason: string; call_id: string }; error: null }) => void
    const pendingStart = new Promise<{ data: { ok: false; reason: string; call_id: string }; error: null }>((resolve) => {
      resolveStart = resolve
    })
    const rpc = vi.fn((name: string) => {
      if (name === 'chat_start_voice_call') return pendingStart
      return Promise.resolve({ data: null, error: null })
    })
    const client = { rpc, functions: { invoke: vi.fn() } } as unknown as SupabaseClient
    const session = new VoiceCallSession(client, () => CONTEXT)

    const startTask = session.startOutgoing()
    await Promise.resolve()

    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith('screen')

    resolveStart({ data: { ok: false, reason: 'peer_busy', call_id: CALL_ID }, error: null })
    await startTask
    await Promise.resolve()

    expect(session.getState().phase).toBe('error')
    expect(release).toHaveBeenCalledOnce()
  })
})
