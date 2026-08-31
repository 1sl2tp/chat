export function requestMicrophoneNow(
  getUserMedia: () => Promise<MediaStream>,
): Promise<MediaStream> {
  return getUserMedia()
}

export function rmsFromTimeDomain(data: Uint8Array): number {
  if (!data.length) return 0
  let sum = 0
  for (const value of data) {
    const sample = (value - 128) / 128
    sum += sample * sample
  }
  return Math.sqrt(sum / data.length)
}
