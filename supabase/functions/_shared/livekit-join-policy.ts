export interface ActiveVoiceCallForLiveKit {
  id: string
  caller_profile_id: string
  callee_profile_id: string
  caller_device_id: string
  accepted_device_id: string | null
  caller_display_name: string | null
  callee_display_name: string | null
  state: string
}

export interface AuthorizedLiveKitJoin {
  roomName: string
  participantIdentity: string
  participantName: string
}

const JOINABLE_STATES = new Set(['ringing', 'accepted', 'connecting', 'connected'])

function normalized(value: string): string {
  return value.trim().toLowerCase()
}

export function authorizeLiveKitJoin(input: {
  currentProfileId: string
  callId: string
  deviceId: string
  activeCalls: readonly ActiveVoiceCallForLiveKit[]
}): AuthorizedLiveKitJoin {
  const callId = normalized(input.callId)
  const profileId = normalized(input.currentProfileId)
  const deviceId = normalized(input.deviceId)
  const call = input.activeCalls.find((row) => normalized(row.id) === callId)

  if (!call) throw new Error('livekit_call_not_found')
  if (!JOINABLE_STATES.has(call.state)) throw new Error('livekit_call_not_joinable')

  let expectedDeviceId: string | null = null
  let participantName = 'TAPHOA Chat'

  if (normalized(call.caller_profile_id) === profileId) {
    expectedDeviceId = normalized(call.caller_device_id)
    participantName = call.caller_display_name?.trim() || participantName
  } else if (normalized(call.callee_profile_id) === profileId) {
    expectedDeviceId = call.accepted_device_id ? normalized(call.accepted_device_id) : null
    participantName = call.callee_display_name?.trim() || participantName
  } else {
    throw new Error('livekit_profile_not_authorized')
  }

  if (!expectedDeviceId || expectedDeviceId !== deviceId) {
    throw new Error('livekit_device_not_authorized')
  }

  return {
    roomName: `taphoa-call-${callId}`,
    participantIdentity: `${profileId}-${deviceId}`,
    participantName,
  }
}
