import type { CallNavigatorAudioSessionLike } from './audio-route'

export type PhoneAudioRoute = 'receiver' | 'speaker'
export type PhoneAudioRouteResult =
  | { ok: true; route: PhoneAudioRoute }
  | { ok: false; route: 'unsupported' }

export function setPhoneAudioRoute(
  navigatorLike: CallNavigatorAudioSessionLike,
  route: PhoneAudioRoute,
): PhoneAudioRouteResult {
  const session = navigatorLike.audioSession
  if (!session) return { ok: false, route: 'unsupported' }

  try {
    session.type = route === 'speaker' ? 'playback' : 'play-and-record'
    const expected = route === 'speaker' ? 'playback' : 'play-and-record'
    if (session.type !== expected) return { ok: false, route: 'unsupported' }
    return { ok: true, route }
  } catch {
    return { ok: false, route: 'unsupported' }
  }
}
