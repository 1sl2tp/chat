import { describe, expect, it } from 'vitest'
import { authorizeLiveKitJoin } from '../../supabase/functions/_shared/livekit-join-policy'

const call = {
  id: '193ee972-e716-44f7-a1aa-c4285fe532f7',
  caller_profile_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  callee_profile_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  caller_device_id: '11111111-1111-1111-1111-111111111111',
  accepted_device_id: '22222222-2222-2222-2222-222222222222',
  caller_display_name: 'User',
  callee_display_name: 'Admin',
  state: 'accepted',
}

describe('authorizeLiveKitJoin', () => {
  it('authorizes the caller only on the caller device', () => {
    expect(authorizeLiveKitJoin({
      currentProfileId: call.caller_profile_id,
      callId: call.id,
      deviceId: call.caller_device_id,
      activeCalls: [call],
    })).toMatchObject({
      roomName: `taphoa-call-${call.id}`,
      participantIdentity: `${call.caller_profile_id}-${call.caller_device_id}`,
      participantName: 'User',
    })
  })

  it('authorizes the callee only on the accepted device', () => {
    expect(authorizeLiveKitJoin({
      currentProfileId: call.callee_profile_id,
      callId: call.id,
      deviceId: call.accepted_device_id!,
      activeCalls: [call],
    }).participantName).toBe('Admin')
  })

  it('rejects another device', () => {
    expect(() => authorizeLiveKitJoin({
      currentProfileId: call.caller_profile_id,
      callId: call.id,
      deviceId: call.accepted_device_id!,
      activeCalls: [call],
    })).toThrow('livekit_device_not_authorized')
  })

  it('rejects ended/non-active calls', () => {
    expect(() => authorizeLiveKitJoin({
      currentProfileId: call.caller_profile_id,
      callId: call.id,
      deviceId: call.caller_device_id,
      activeCalls: [{ ...call, state: 'ended' }],
    })).toThrow('livekit_call_not_joinable')
  })
})
