import type { MatrixProfileId } from './matrix-profiles'

interface AudioSessionLike { type: string }
interface NavigatorAudioLike { audioSession?: AudioSessionLike }
interface MediaDevicesLike { getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> }

export interface CaptureRecoveryResult {
  stream: MediaStream
  track: MediaStreamTrack
  audioSessionType: string
  constraints: MediaStreamConstraints
}

function setSession(navigatorLike: NavigatorAudioLike, type: string): void {
  try { if (navigatorLike.audioSession) navigatorLike.audioSession.type = type } catch {}
}

export async function captureIOSRecoveryTrack(
  profile: MatrixProfileId,
  mediaDevices: MediaDevicesLike,
  navigatorLike: NavigatorAudioLike,
): Promise<CaptureRecoveryResult> {
  const raw = profile === 'raw-mic-reroute'
  const reset = profile === 'webkit-reset-reroute' || raw

  if (reset) setSession(navigatorLike, 'playback')
  setSession(navigatorLike, 'auto')

  const constraints: MediaStreamConstraints = raw
    ? { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } }
    : { audio: true }

  const stream = await mediaDevices.getUserMedia(constraints)
  const track = stream.getAudioTracks()[0]
  if (!track) throw new Error('iOS recovery microphone missing')

  setSession(navigatorLike, 'play-and-record')
  return {
    stream,
    track,
    audioSessionType: navigatorLike.audioSession?.type ?? 'unsupported',
    constraints,
  }
}
