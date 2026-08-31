import { describe, expect, it } from 'vitest'
import { captureIOSRecoveryTrack } from './ios-capture-recovery'

function harness() {
  const events: string[] = []
  const session = {
    _type: 'auto',
    get type() { return this._type },
    set type(value: string) { this._type = value; events.push(`session:${value}`) },
  }
  const track = { kind: 'audio' }
  const stream = { getAudioTracks: () => [track] }
  const mediaDevices = {
    getUserMedia: async (constraints: MediaStreamConstraints) => {
      events.push(`gum:${JSON.stringify(constraints.audio)}`)
      return stream as unknown as MediaStream
    },
  }
  return { events, session, mediaDevices, track }
}

describe('iOS capture recovery', () => {
  it('runs the WebKit reroute sequence in the documented order', async () => {
    const h = harness()
    const result = await captureIOSRecoveryTrack('webkit-reroute', h.mediaDevices, { audioSession: h.session })
    expect(result.track).toBe(h.track)
    expect(h.events).toEqual(['session:auto', 'gum:true', 'session:play-and-record'])
  })

  it('resets playback before rerouting when requested', async () => {
    const h = harness()
    await captureIOSRecoveryTrack('webkit-reset-reroute', h.mediaDevices, { audioSession: h.session })
    expect(h.events).toEqual(['session:playback', 'session:auto', 'gum:true', 'session:play-and-record'])
  })

  it('disables processing and forces mono in the raw profile', async () => {
    const h = harness()
    await captureIOSRecoveryTrack('raw-mic-reroute', h.mediaDevices, { audioSession: h.session })
    expect(h.events[0]).toBe('session:playback')
    expect(h.events[1]).toBe('session:auto')
    expect(h.events[2]).toContain('"echoCancellation":false')
    expect(h.events[2]).toContain('"noiseSuppression":false')
    expect(h.events[2]).toContain('"autoGainControl":false')
    expect(h.events[2]).toContain('"channelCount":1')
    expect(h.events[3]).toBe('session:play-and-record')
  })
})
