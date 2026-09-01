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
    // WebKit uses play-and-record for voice-call/receiver routing. Never pass
    // through playback while requesting the receiver: on affected iOS 26
    // builds that can leave the physical route stuck on the loudspeaker even
    // if a later AudioSession write reports play-and-record.
    session.type = route === 'speaker' ? 'playback' : 'play-and-record'

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
