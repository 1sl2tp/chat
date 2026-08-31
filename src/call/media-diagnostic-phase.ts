export type CallMediaDiagnosticPhase =
  | 'peer'
  | 'signal'
  | 'ice'
  | 'playback'
  | 'connected'
  | 'stats'
  | 'error'
  | 'teardown'

export type CallMediaDiagnosticEvent =
  | 'joined'
  | 'peer_connected'
  | 'remote_audio_subscribed'
  | 'remote_audio_playing'
  | 'remote_audio_blocked'
  | 'mute_on'
  | 'mute_off'
  | 'audio_output_selected'
  | 'audio_output_unavailable'
  | 'leave'

const EVENT_PHASE: Readonly<Record<CallMediaDiagnosticEvent, CallMediaDiagnosticPhase>> = Object.freeze({
  joined: 'peer',
  peer_connected: 'connected',
  remote_audio_subscribed: 'playback',
  remote_audio_playing: 'playback',
  remote_audio_blocked: 'error',
  mute_on: 'stats',
  mute_off: 'stats',
  audio_output_selected: 'playback',
  audio_output_unavailable: 'playback',
  leave: 'teardown',
})

export function diagnosticPhaseForEvent(event: CallMediaDiagnosticEvent): CallMediaDiagnosticPhase {
  return EVENT_PHASE[event]
}
