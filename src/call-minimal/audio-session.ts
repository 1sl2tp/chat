export interface CallAudioSessionLike {
  type: string
}

export interface CallNavigatorLike {
  audioSession?: CallAudioSessionLike
}

function setIosAudioSessionType(
  userAgent: string,
  navigatorLike: CallNavigatorLike,
  type: 'auto' | 'play-and-record',
): boolean {
  if (!/iPhone|iPad|iPod/i.test(userAgent)) return false
  if (!navigatorLike.audioSession) return false

  try {
    navigatorLike.audioSession.type = type
    return navigatorLike.audioSession.type === type
  } catch {
    return false
  }
}

export function prepareCallAudioSession(userAgent: string, navigatorLike: CallNavigatorLike): boolean {
  return setIosAudioSessionType(userAgent, navigatorLike, 'auto')
}

export function activateCallAudioSessionAfterCapture(userAgent: string, navigatorLike: CallNavigatorLike): boolean {
  return setIosAudioSessionType(userAgent, navigatorLike, 'play-and-record')
}
