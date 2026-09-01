export interface RemoteAudioOwnerDeps {
  createAudio?: () => HTMLAudioElement
  createStream?: (tracks: MediaStreamTrack[]) => MediaStream
}

export function createOwnedRemoteAudio(
  track: MediaStreamTrack,
  deps: RemoteAudioOwnerDeps = {},
): HTMLAudioElement {
  const element = deps.createAudio ? deps.createAudio() : document.createElement('audio')
  const stream = deps.createStream ? deps.createStream([track]) : new MediaStream([track])

  element.autoplay = true
  element.srcObject = stream
  return element
}
