export interface CallMicrophoneCaptureDeps {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
}

export interface CallMicrophonePublishOptions {
  source: string
}

export type PublishCapturedMicrophone = (
  track: MediaStreamTrack,
  options: CallMicrophonePublishOptions,
) => Promise<unknown>

export function beginCallMicrophoneCapture(
  deps: CallMicrophoneCaptureDeps,
): Promise<MediaStream> {
  return deps.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  })
}

export async function waitForCapturedMicrophone(
  stream: MediaStream | null,
  pending: Promise<MediaStream> | null,
): Promise<MediaStream> {
  if (stream) return stream
  if (pending) return pending
  throw new Error('microphone_not_prepared')
}

export async function publishCapturedMicrophone(
  stream: MediaStream,
  microphoneSource: string,
  publishTrack: PublishCapturedMicrophone,
): Promise<MediaStreamTrack> {
  const track = stream.getAudioTracks()[0]
  if (!track) throw new Error('audio_track_missing')
  await publishTrack(track, { source: microphoneSource })
  return track
}
