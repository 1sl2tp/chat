export function beginPureMicCapture(deps: {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
}): Promise<MediaStream> {
  return deps.getUserMedia({ audio: true, video: false })
}
