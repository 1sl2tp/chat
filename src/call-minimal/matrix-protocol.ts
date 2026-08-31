export type MatrixDevice = 'ios' | 'android' | 'web'

export type MatrixMessage =
  | { type: 'armed'; runKey: string; device: MatrixDevice }
  | { type: 'start'; runKey: string; startAt: number }
  | { type: 'p2p-offer'; runKey: string; sdp: string }
  | { type: 'p2p-answer'; runKey: string; sdp: string }
  | { type: 'p2p-ice'; runKey: string; candidate: RTCIceCandidateInit }

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function encodeMatrixMessage(message: MatrixMessage): Uint8Array {
  return encoder.encode(JSON.stringify(message))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function decodeMatrixMessage(data: Uint8Array): MatrixMessage | null {
  try {
    const parsed: unknown = JSON.parse(decoder.decode(data))
    if (!isRecord(parsed) || typeof parsed.type !== 'string' || typeof parsed.runKey !== 'string') return null

    if (parsed.type === 'armed' && (parsed.device === 'ios' || parsed.device === 'android' || parsed.device === 'web')) {
      return { type: 'armed', runKey: parsed.runKey, device: parsed.device }
    }
    if (parsed.type === 'start' && typeof parsed.startAt === 'number' && Number.isFinite(parsed.startAt)) {
      return { type: 'start', runKey: parsed.runKey, startAt: parsed.startAt }
    }
    if ((parsed.type === 'p2p-offer' || parsed.type === 'p2p-answer') && typeof parsed.sdp === 'string') {
      return { type: parsed.type, runKey: parsed.runKey, sdp: parsed.sdp }
    }
    if (parsed.type === 'p2p-ice' && isRecord(parsed.candidate) && typeof parsed.candidate.candidate === 'string') {
      const candidate: RTCIceCandidateInit = {
        candidate: parsed.candidate.candidate,
        sdpMid: typeof parsed.candidate.sdpMid === 'string' ? parsed.candidate.sdpMid : null,
        sdpMLineIndex: typeof parsed.candidate.sdpMLineIndex === 'number' ? parsed.candidate.sdpMLineIndex : null,
      }
      return { type: 'p2p-ice', runKey: parsed.runKey, candidate }
    }
    return null
  } catch {
    return null
  }
}
