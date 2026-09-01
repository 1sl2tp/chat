export interface CallAudioSessionLike {
  type: string
}

export interface CallNavigatorAudioSessionLike {
  audioSession?: CallAudioSessionLike
}

export function routeCallToReceiverAfterMicrophone(
  navigatorLike: CallNavigatorAudioSessionLike,
): boolean {
  const session = navigatorLike.audioSession
  if (!session) return false

  try {
    session.type = 'play-and-record'
    return session.type === 'play-and-record'
  } catch {
    return false
  }
}

export function resetCallAudioRoute(
  navigatorLike: CallNavigatorAudioSessionLike,
): boolean {
  const session = navigatorLike.audioSession
  if (!session) return false

  try {
    // WebKit can keep the call route active after microphone capture stops.
    // playback -> auto reliably returns the document to normal media routing.
    session.type = 'playback'
    session.type = 'auto'
    return session.type === 'auto'
  } catch {
    return false
  }
}
