import { describe, expect, it } from 'vitest'
import { fetchLiveKitCredentials } from './livekit-credentials'

type InvokeResult = {
  data: unknown
  error: { message: string } | null
}

function fakeClient(result: InvokeResult, calls: Array<{ name: string; body: unknown }>) {
  return {
    functions: {
      invoke: async (name: string, options: { body: unknown }) => {
        calls.push({ name, body: options.body })
        return result
      },
    },
  }
}

describe('fetchLiveKitCredentials', () => {
  it('invokes the production token function with call and device ids', async () => {
    const calls: Array<{ name: string; body: unknown }> = []
    const client = fakeClient({
      data: {
        serverUrl: 'wss://taphoa-chat-dvo9mem2.livekit.cloud',
        participantToken: 'signed-token',
      },
      error: null,
    }, calls)

    await expect(fetchLiveKitCredentials(client as never, 'call-1', 'device-1')).resolves.toEqual({
      serverUrl: 'wss://taphoa-chat-dvo9mem2.livekit.cloud',
      participantToken: 'signed-token',
    })
    expect(calls).toEqual([{
      name: 'taphoa-livekit-token',
      body: { callId: 'call-1', deviceId: 'device-1' },
    }])
  })

  it('wraps invocation errors', async () => {
    const client = fakeClient({ data: null, error: { message: 'network down' } }, [])
    await expect(fetchLiveKitCredentials(client as never, 'call-1', 'device-1'))
      .rejects.toThrow('livekit_credentials_failed:network down')
  })

  it('rejects an empty participant token', async () => {
    const client = fakeClient({
      data: { serverUrl: 'wss://taphoa-chat-dvo9mem2.livekit.cloud', participantToken: '' },
      error: null,
    }, [])
    await expect(fetchLiveKitCredentials(client as never, 'call-1', 'device-1'))
      .rejects.toThrow('livekit_credentials_invalid')
  })

  it('rejects a mismatched LiveKit server', async () => {
    const client = fakeClient({
      data: { serverUrl: 'wss://example.livekit.cloud', participantToken: 'signed-token' },
      error: null,
    }, [])
    await expect(fetchLiveKitCredentials(client as never, 'call-1', 'device-1'))
      .rejects.toThrow('livekit_server_mismatch')
  })
})
