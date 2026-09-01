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
      // On iPhone WebKit, getUserMedia can leave the physical output on the
      // loudspeaker even while AudioSession already reports play-and-record.
      // Reset through `auto` first so the following voice-call mode write is a
      // real category transition. Never prime the receiver through `playback`,
      // because that explicitly selects media/speaker routing.
      session.type = 'auto'
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

export function reassertPhoneAudioRouteAfterPlayback(
  navigatorLike: CallNavigatorAudioSessionLike,
  speakerEnabled: boolean,
): PhoneAudioRouteResult {
  return setPhoneAudioRoute(navigatorLike, speakerEnabled ? 'speaker' : 'receiver')
}
