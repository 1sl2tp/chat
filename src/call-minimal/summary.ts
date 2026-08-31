export type MinimalCallGate = 'pass' | 'fail' | 'inconclusive'

export interface MinimalCallMetrics {
  connected: boolean
  micTrackLive: boolean
  micTrackWasLive: boolean
  outboundBytesDelta: number
  outboundPacketsDelta: number
  remoteTrackSubscribed: boolean
  inboundBytesDelta: number
  inboundPacketsDelta: number
  playbackStarted: boolean
  cleanLeave: boolean
}

export interface MinimalCallSummary {
  overallStatus: MinimalCallGate
  connection: MinimalCallGate
  microphone: MinimalCallGate
  remoteAudio: MinimalCallGate
  playback: MinimalCallGate
  cleanup: MinimalCallGate
}

export function summarizeMinimalCall(metrics: MinimalCallMetrics): MinimalCallSummary {
  const connection: MinimalCallGate = metrics.connected ? 'pass' : 'fail'
  const microphone: MinimalCallGate = metrics.micTrackWasLive && metrics.outboundBytesDelta > 0 && metrics.outboundPacketsDelta > 0
    ? 'pass'
    : 'fail'
  const remoteAudio: MinimalCallGate = !metrics.remoteTrackSubscribed
    ? 'inconclusive'
    : metrics.inboundBytesDelta > 0 && metrics.inboundPacketsDelta > 0
      ? 'pass'
      : 'fail'
  const playback: MinimalCallGate = !metrics.remoteTrackSubscribed
    ? 'inconclusive'
    : metrics.playbackStarted
      ? 'pass'
      : 'fail'
  const cleanup: MinimalCallGate = metrics.cleanLeave ? 'pass' : 'fail'

  const gates = [connection, microphone, remoteAudio, playback, cleanup]
  const overallStatus: MinimalCallGate = gates.includes('fail')
    ? 'fail'
    : gates.includes('inconclusive')
      ? 'inconclusive'
      : 'pass'

  return { overallStatus, connection, microphone, remoteAudio, playback, cleanup }
}
