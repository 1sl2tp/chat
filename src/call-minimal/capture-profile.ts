export type MinimalCallAudioCaptureOptions = {
  voiceIsolation?: boolean
}

export function captureOptionsForUserAgent(userAgent: string): MinimalCallAudioCaptureOptions | undefined {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return { voiceIsolation: false }
  return undefined
}
