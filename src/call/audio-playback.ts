export type RemoteAudioPlaybackResult = 'playing' | 'blocked'

export async function playRemoteAudioElement(element: HTMLMediaElement): Promise<RemoteAudioPlaybackResult> {
  element.autoplay = true
  element.muted = false
  element.volume = 1
  element.setAttribute('playsinline', '')

  try {
    await element.play()
    return 'playing'
  } catch {
    return 'blocked'
  }
}
