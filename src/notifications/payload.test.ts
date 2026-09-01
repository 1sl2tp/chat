import { describe, expect, it } from 'vitest'
import { notificationVibration, parsePushPayload, shouldShowSystemNotification } from './payload'

describe('push payload parsing', () => {
  it('keeps notification fields and event type used by the client', () => {
    expect(parsePushPayload({
      type: 'incoming_call',
      title: 'Cuộc gọi đến',
      body: 'Khách hàng đang gọi',
      navigate: './?call=123',
      badge: 3,
      tag: 'call-123',
      token: 'must-not-leak',
    })).toEqual({
      type: 'incoming_call',
      title: 'Cuộc gọi đến',
      body: 'Khách hàng đang gọi',
      navigate: './?call=123',
      badge: 3,
      tag: 'call-123',
    })
  })

  it('falls back to safe defaults for malformed payloads', () => {
    expect(parsePushPayload(null)).toEqual({
      type: undefined,
      title: 'Chat',
      body: '',
      navigate: './',
      badge: undefined,
      tag: undefined,
    })
  })
})

describe('system notification policy', () => {
  it('does not duplicate an incoming-call popup when the app is already visible', () => {
    expect(shouldShowSystemNotification('incoming_call', true)).toBe(false)
    expect(shouldShowSystemNotification('incoming_call', false)).toBe(true)
  })

  it('keeps chat notifications visible even while the app is open', () => {
    expect(shouldShowSystemNotification('chat_message', true)).toBe(true)
  })

  it('requests an incoming-call vibration pattern for platforms that support it', () => {
    expect(notificationVibration('incoming_call')).toEqual([350, 180, 350, 900])
    expect(notificationVibration('chat_message')).toBeUndefined()
  })
})
