export interface CallAudioSessionLike {
  type: string
}

export interface CallNavigatorLike {
  audioSession?: CallAudioSessionLike
}

export function prepareCallAudioSession(userAgent: string, navigatorLike: CallNavigatorLike): boolean {
  if (!/iPhone|iPad|iPod/i.test(userAgent)) return false
  if (!navigatorLike.audioSession) return false

  try {
    navigatorLike.audioSession.type = 'play-and-record'
    return navigatorLike.audioSession.type === 'play-and-record'
  } catch {
    return false
  }
}
