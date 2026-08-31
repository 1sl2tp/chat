import { describe, expect, it } from 'vitest'
import { createDiagnosticsSnapshot } from './snapshot'

describe('safe diagnostics snapshot', () => {
  it('keeps only technical allow-listed fields', () => {
    const input = {
      build: { version: '0.1.0', id: 'abc123' },
      runtime: { os: 'ios', browser: 'safari', formFactor: 'mobile', appMode: 'standalone' },
      capabilities: {
        serviceWorker: true,
        notifications: true,
        permissionsApi: true,
        mediaDevices: true,
        getUserMedia: true,
        peerConnection: true,
        audioOutputSelection: false,
        pushManager: true,
        appBadge: true,
        mediaSession: true,
        videoPictureInPicture: false,
        documentPictureInPicture: false,
        wakeLock: true,
        visualViewport: true,
        virtualKeyboard: false,
      },
      permissions: {
        notifications: 'granted',
        microphone: 'prompt',
      },
      viewport: {
        layoutHeight: 844,
        visualHeight: 544,
        offsetTop: 0,
        keyboardInset: 300,
        keyboardOpen: true,
      },
      media: {
        microphone: 'granted',
        localTrack: 'live',
        remoteTrack: 'live',
        playback: 'playing',
        output: 'default',
        connection: 'connected',
        ice: 'connected',
        candidate: 'relay',
        visibility: 'hidden',
      },
      token: 'must-not-leak',
      message: 'must-not-leak',
    } as const

    const snapshot = createDiagnosticsSnapshot(input)

    expect(snapshot).toEqual({
      build: { version: '0.1.0', id: 'abc123' },
      runtime: { os: 'ios', browser: 'safari', formFactor: 'mobile', appMode: 'standalone' },
      capabilities: input.capabilities,
      permissions: input.permissions,
      viewport: input.viewport,
      media: input.media,
    })
    expect(snapshot).not.toHaveProperty('token')
    expect(snapshot).not.toHaveProperty('message')
  })
})
