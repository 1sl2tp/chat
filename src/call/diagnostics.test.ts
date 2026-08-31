import { describe, expect, it } from 'vitest'
import { collectCallMediaDiagnostics } from './diagnostics'

describe('call media diagnostics', () => {
  it('reports two-way audio bytes and selected candidate types without mutating the peer', async () => {
    const rows = new Map<string, any>([
      ['out', { id: 'out', type: 'outbound-rtp', kind: 'audio', bytesSent: 1200, packetsSent: 12 }],
      ['in', { id: 'in', type: 'inbound-rtp', kind: 'audio', bytesReceived: 900, packetsReceived: 9 }],
      ['transport', { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' }],
      ['pair', { id: 'pair', type: 'candidate-pair', localCandidateId: 'local', remoteCandidateId: 'remote' }],
      ['local', { id: 'local', type: 'local-candidate', candidateType: 'relay' }],
      ['remote', { id: 'remote', type: 'remote-candidate', candidateType: 'srflx' }],
    ])
    const stats = {
      forEach(callback: (value: any) => void) { rows.forEach(callback) },
      get(id: string) { return rows.get(id) },
    } as unknown as RTCStatsReport
    const peer = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      signalingState: 'stable',
      getStats: async () => stats,
    } as Pick<RTCPeerConnection, 'getStats' | 'connectionState' | 'iceConnectionState' | 'signalingState'>
    const localTrack = { readyState: 'live', enabled: true, muted: false } as MediaStreamTrack
    const stream = { getAudioTracks: () => [localTrack] } as Pick<MediaStream, 'getAudioTracks'>
    const audio = { paused: false } as Pick<HTMLAudioElement, 'paused'>

    await expect(collectCallMediaDiagnostics(peer, stream, audio)).resolves.toMatchObject({
      bytes_sent: 1200,
      bytes_received: 900,
      packets_sent: 12,
      packets_received: 9,
      local_candidate_type: 'relay',
      remote_candidate_type: 'srflx',
      local_track: 'live',
      local_track_enabled: true,
      remote_playback: 'playing',
    })
  })
})
