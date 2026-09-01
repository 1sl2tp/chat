import { describe, expect, it } from 'vitest'
import { assertLiveKitServerUrl, liveKitRoomName } from './livekit-config'

describe('LiveKit call contract', () => {
  it('maps one call id to one deterministic room', () => {
    expect(liveKitRoomName('193EE972-e716-44f7-a1aa-c4285fe532f7')).toBe(
      'taphoa-call-193ee972-e716-44f7-a1aa-c4285fe532f7',
    )
  })

  it('accepts only the configured LiveKit Cloud host', () => {
    expect(() => assertLiveKitServerUrl('wss://taphoa-chat-dvo9mem2.livekit.cloud')).not.toThrow()
    expect(() => assertLiveKitServerUrl('wss://other.livekit.cloud')).toThrow('livekit_server_mismatch')
  })
})
