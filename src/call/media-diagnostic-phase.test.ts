import { describe, expect, it } from 'vitest'
import { diagnosticPhaseForEvent } from './media-diagnostic-phase'

describe('LiveKit media diagnostics phase mapping', () => {
  it('maps every LiveKit event onto a database-accepted diagnostic phase', () => {
    expect(diagnosticPhaseForEvent('joined')).toBe('peer')
    expect(diagnosticPhaseForEvent('peer_connected')).toBe('connected')
    expect(diagnosticPhaseForEvent('remote_audio_subscribed')).toBe('playback')
    expect(diagnosticPhaseForEvent('remote_audio_playing')).toBe('playback')
    expect(diagnosticPhaseForEvent('remote_audio_blocked')).toBe('error')
    expect(diagnosticPhaseForEvent('mute_on')).toBe('stats')
    expect(diagnosticPhaseForEvent('mute_off')).toBe('stats')
    expect(diagnosticPhaseForEvent('audio_output_selected')).toBe('playback')
    expect(diagnosticPhaseForEvent('audio_output_unavailable')).toBe('playback')
    expect(diagnosticPhaseForEvent('leave')).toBe('teardown')
  })
})
