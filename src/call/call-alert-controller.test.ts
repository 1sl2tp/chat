import { describe, expect, it, vi } from 'vitest'
import { CallAlertController } from './call-alert-controller'
import type { VoiceCallState } from './voice-session'

function state(patch: Partial<VoiceCallState> = {}): VoiceCallState {
  return {
    phase: 'idle',
    display: 'full',
    direction: null,
    callId: null,
    peerName: '',
    muted: false,
    speakerAvailable: false,
    speakerSelected: false,
    audioBlocked: false,
    permissionNotice: null,
    connectedAt: null,
    error: null,
    ...patch,
  }
}

function harness() {
  const audio = {
    arm: vi.fn(() => undefined),
    startIncoming: vi.fn(() => undefined),
    startRingback: vi.fn(() => undefined),
    stop: vi.fn(() => undefined),
  }
  const vibration = {
    start: vi.fn(() => undefined),
    stop: vi.fn(() => undefined),
  }
  return { audio, vibration, controller: new CallAlertController(audio, vibration) }
}

describe('CallAlertController', () => {
  it('arms alert audio only after the microphone gesture owner calls it', () => {
    const { audio, controller } = harness()

    controller.armAfterMicrophoneGesture()

    expect(audio.arm).toHaveBeenCalledOnce()
  })

  it('rings and vibrates only for an incoming ringing call', () => {
    const { audio, vibration, controller } = harness()

    controller.sync(state({ phase: 'incoming', direction: 'incoming' }))
    expect(audio.startIncoming).toHaveBeenCalledOnce()
    expect(vibration.start).toHaveBeenCalledOnce()

    controller.sync(state({ phase: 'connecting' }))
    expect(audio.stop).toHaveBeenCalled()
    expect(vibration.stop).toHaveBeenCalled()
  })

  it('plays ringback for outgoing and stops when connecting', () => {
    const { audio, vibration, controller } = harness()

    controller.sync(state({ phase: 'outgoing', direction: 'outgoing' }))
    expect(audio.startRingback).toHaveBeenCalledOnce()
    expect(vibration.start).not.toHaveBeenCalled()

    controller.sync(state({ phase: 'connecting' }))
    expect(audio.stop).toHaveBeenCalled()
  })

  it('does not restart the same alert mode on repeated polling updates', () => {
    const { audio, vibration, controller } = harness()

    controller.sync(state({ phase: 'incoming', peerName: 'Admin' }))
    controller.sync(state({ phase: 'incoming', peerName: 'Admin hỗ trợ' }))

    expect(audio.startIncoming).toHaveBeenCalledOnce()
    expect(vibration.start).toHaveBeenCalledOnce()
  })

  it('never leaves alerts running after idle, error, or explicit stop', () => {
    const { audio, vibration, controller } = harness()

    controller.sync(state({ phase: 'incoming' }))
    controller.sync(state({ phase: 'idle' }))
    controller.sync(state({ phase: 'error', error: 'failed' }))
    controller.stop()

    expect(audio.stop).toHaveBeenCalled()
    expect(vibration.stop).toHaveBeenCalled()
  })
})
