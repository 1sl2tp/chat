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
    if (route === 'receiver') {
      // Safari may keep the loudspeaker route even while the reported session
      // type already says play-and-record. Cross playback first so WebKit has
      // to recompute the active output route, then return to voice-call mode.
      session.type = 'playback'
      session.type = 'play-and-record'
    } else {
      session.type = 'playback'
    }

    const expected = route === 'speaker' ? 'playback' : 'play-and-record'
    if (session.type !== expected) return { ok: false, route: 'unsupported' }
    return { ok: true, route }
  } catch {
    return { ok: false, route: 'unsupported' }
  }
}
