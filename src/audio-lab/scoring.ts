export type GateStatus = 'pass' | 'fail' | 'unverified'
export type EchoReturnStatus = 'low' | 'moderate' | 'high' | 'unverified'

export interface AudioLabMeasuredMetrics {
  micSenderBytesDelta: number
  botMicReceiverBytesDelta: number
  botToneSenderBytesDelta: number
  deviceToneReceiverBytesDelta: number
  deviceToneEnergyDelta: number
  baselineMicEnergyDelta: number
  toneMicEnergyDelta: number
  playbackApiPlaying: boolean
}

export interface AudioLabScore {
  overallStatus: 'pass' | 'fail' | 'inconclusive'
  micTransport: GateStatus
  remoteTransport: GateStatus
  playbackPipeline: GateStatus
  echoReturn: EchoReturnStatus
  physicalOutputRoute: 'unverified'
  physicalMicSignal: 'unverified'
  echoLeakRatio: number | null
}

const MIN_BYTES = 256
const MIN_TONE_ENERGY = 0.0001

export function scoreAudioLab(metrics: AudioLabMeasuredMetrics): AudioLabScore {
  const micTransport =
    metrics.micSenderBytesDelta > MIN_BYTES && metrics.botMicReceiverBytesDelta > MIN_BYTES
      ? 'pass'
      : 'fail'

  const remoteTransport =
    metrics.botToneSenderBytesDelta > MIN_BYTES &&
    metrics.deviceToneReceiverBytesDelta > MIN_BYTES &&
    metrics.deviceToneEnergyDelta > MIN_TONE_ENERGY
      ? 'pass'
      : 'fail'

  const playbackPipeline = metrics.playbackApiPlaying ? 'pass' : 'fail'

  let echoLeakRatio: number | null = null
  let echoReturn: EchoReturnStatus = 'unverified'
  if (metrics.deviceToneEnergyDelta > MIN_TONE_ENERGY) {
    const excessMicEnergy = Math.max(0, metrics.toneMicEnergyDelta - metrics.baselineMicEnergyDelta)
    echoLeakRatio = excessMicEnergy / metrics.deviceToneEnergyDelta
    if (echoLeakRatio >= 0.2) echoReturn = 'high'
    else if (echoLeakRatio >= 0.05) echoReturn = 'moderate'
    else echoReturn = 'low'
  }

  const overallStatus =
    micTransport === 'pass' && remoteTransport === 'pass' && playbackPipeline === 'pass'
      ? 'pass'
      : 'fail'

  return {
    overallStatus,
    micTransport,
    remoteTransport,
    playbackPipeline,
    echoReturn,
    physicalOutputRoute: 'unverified',
    physicalMicSignal: 'unverified',
    echoLeakRatio,
  }
}
