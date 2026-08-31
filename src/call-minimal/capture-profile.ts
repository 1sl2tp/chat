export type MinimalCallAudioCaptureOptions = {
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
  channelCount?: number
  voiceIsolation?: boolean
}

export function captureOptionsForUserAgent(userAgent: string): MinimalCallAudioCaptureOptions | undefined {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      voiceIsolation: false,
    }
  }
  return undefined
}
