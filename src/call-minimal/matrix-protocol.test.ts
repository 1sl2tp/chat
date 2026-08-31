import { describe, expect, it } from 'vitest'
import { decodeMatrixMessage, encodeMatrixMessage, type MatrixMessage } from './matrix-protocol'

describe('matrix control protocol', () => {
  it('round trips armed and start messages', () => {
    const messages: MatrixMessage[] = [
      { type: 'armed', runKey: 'run-1', device: 'ios' },
      { type: 'start', runKey: 'run-1', startAt: 123456 },
    ]
    for (const message of messages) {
      expect(decodeMatrixMessage(encodeMatrixMessage(message))).toEqual(message)
    }
  })

  it('round trips p2p offer answer and candidate messages', () => {
    const messages: MatrixMessage[] = [
      { type: 'p2p-offer', runKey: 'run-2', sdp: 'offer-sdp' },
      { type: 'p2p-answer', runKey: 'run-2', sdp: 'answer-sdp' },
      { type: 'p2p-ice', runKey: 'run-2', candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } },
    ]
    for (const message of messages) {
      expect(decodeMatrixMessage(encodeMatrixMessage(message))).toEqual(message)
    }
  })

  it('rejects unrelated or malformed data', () => {
    expect(decodeMatrixMessage(new TextEncoder().encode('not json'))).toBeNull()
    expect(decodeMatrixMessage(new TextEncoder().encode('{"type":"legacy"}'))).toBeNull()
  })
})
