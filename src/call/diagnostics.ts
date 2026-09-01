export type MicrophoneProcessingVerdict = 'verified' | 'degraded' | 'unknown'

export interface MicrophoneProcessingDiagnostics {
  local_source_echo_cancellation: boolean | null
  local_source_noise_suppression: boolean | null
  local_source_auto_gain_control: boolean | null
  local_source_channel_count: number | null
  local_source_sample_rate: number | null
  microphone_processing: MicrophoneProcessingVerdict
}

export interface CallMediaDiagnostics extends MicrophoneProcessingDiagnostics {
  connection_state: RTCPeerConnectionState
  ice_state: RTCIceConnectionState
  signaling_state: RTCSignalingState
  bytes_sent: number
  bytes_received: number
  packets_sent: number
  packets_received: number
  local_candidate_type: string
  remote_candidate_type: string
  local_track: string
  local_track_enabled: boolean | null
  local_track_muted: boolean | null
  remote_playback: 'playing' | 'idle'
}

type StatsPeer = Pick<RTCPeerConnection, 'getStats' | 'connectionState' | 'iceConnectionState' | 'signalingState'>
type AudioStream = Pick<MediaStream, 'getAudioTracks'>
type AudioPlayback = Pick<HTMLAudioElement, 'paused'>
type SettingsTrack = Pick<MediaStreamTrack, 'getSettings'>

function booleanSetting(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function numberSetting(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function collectMicrophoneProcessingDiagnostics(
  track?: SettingsTrack | null,
): Readonly<MicrophoneProcessingDiagnostics> {
  let settings: Record<string, unknown> = {}
  try {
    settings = track?.getSettings() as Record<string, unknown> ?? {}
  } catch {
    settings = {}
  }

  const echoCancellation = booleanSetting(settings.echoCancellation)
  const noiseSuppression = booleanSetting(settings.noiseSuppression)
  const autoGainControl = booleanSetting(settings.autoGainControl)
  const processingValues = [echoCancellation, noiseSuppression, autoGainControl]
  const verdict: MicrophoneProcessingVerdict = processingValues.every((value) => value === true)
    ? 'verified'
    : processingValues.some((value) => value === false)
      ? 'degraded'
      : 'unknown'

  return Object.freeze({
    local_source_echo_cancellation: echoCancellation,
    local_source_noise_suppression: noiseSuppression,
    local_source_auto_gain_control: autoGainControl,
    local_source_channel_count: numberSetting(settings.channelCount),
    local_source_sample_rate: numberSetting(settings.sampleRate),
    microphone_processing: verdict,
  })
}

export async function collectCallMediaDiagnostics(
  peer: StatsPeer,
  localStream?: AudioStream | null,
  remoteAudio?: AudioPlayback | null,
): Promise<Readonly<CallMediaDiagnostics>> {
  const stats = await peer.getStats()
  let bytesSent = 0
  let bytesReceived = 0
  let packetsSent = 0
  let packetsReceived = 0
  let selectedPair: RTCStats | undefined

  stats.forEach((stat) => {
    const row = stat as RTCStats & Record<string, unknown>
    if (row.type === 'outbound-rtp' && row.kind === 'audio') {
      bytesSent += Number(row.bytesSent ?? 0)
      packetsSent += Number(row.packetsSent ?? 0)
    }
    if (row.type === 'inbound-rtp' && row.kind === 'audio') {
      bytesReceived += Number(row.bytesReceived ?? 0)
      packetsReceived += Number(row.packetsReceived ?? 0)
    }
    if (row.type === 'transport' && typeof row.selectedCandidatePairId === 'string') {
      selectedPair = stats.get(row.selectedCandidatePairId)
    }
  })

  const pair = selectedPair as (RTCStats & Record<string, unknown>) | undefined
  const localCandidate = typeof pair?.localCandidateId === 'string'
    ? stats.get(pair.localCandidateId) as (RTCStats & Record<string, unknown>) | undefined
    : undefined
  const remoteCandidate = typeof pair?.remoteCandidateId === 'string'
    ? stats.get(pair.remoteCandidateId) as (RTCStats & Record<string, unknown>) | undefined
    : undefined
  const localTrack = localStream?.getAudioTracks()[0]
  const processing = collectMicrophoneProcessingDiagnostics(localTrack)

  return Object.freeze({
    connection_state: peer.connectionState,
    ice_state: peer.iceConnectionState,
    signaling_state: peer.signalingState,
    bytes_sent: bytesSent,
    bytes_received: bytesReceived,
    packets_sent: packetsSent,
    packets_received: packetsReceived,
    local_candidate_type: String(localCandidate?.candidateType ?? 'unknown'),
    remote_candidate_type: String(remoteCandidate?.candidateType ?? 'unknown'),
    local_track: localTrack?.readyState ?? 'idle',
    local_track_enabled: localTrack ? localTrack.enabled : null,
    local_track_muted: localTrack ? localTrack.muted : null,
    remote_playback: remoteAudio && !remoteAudio.paused ? 'playing' : 'idle',
    ...processing,
  })
}
