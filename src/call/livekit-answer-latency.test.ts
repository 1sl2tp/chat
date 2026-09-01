import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { warmLiveKitTokenFunction } from './livekit-credentials'
import { connectRoomWhileCapturing } from './livekit-media'

describe('call answer latency', () => {
  it('warms the token function without surfacing warm-up failures', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: new Error('cold start') }))
    const client = { functions: { invoke } } as unknown as SupabaseClient

    await expect(warmLiveKitTokenFunction(client)).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('taphoa-livekit-token', {
      body: { action: 'warm' },
    })
  })

  it('starts room connection before microphone capture has finished', async () => {
    let resolveMicrophone!: (value: MediaStream) => void
    const microphone = new Promise<MediaStream>((resolve) => { resolveMicrophone = resolve })
    const connectRoom = vi.fn(async () => undefined)

    const task = connectRoomWhileCapturing(
      () => microphone,
      connectRoom,
    )

    expect(connectRoom).toHaveBeenCalledOnce()

    resolveMicrophone({ getTracks: () => [] } as unknown as MediaStream)
    await expect(task).resolves.toBeDefined()
  })
})
