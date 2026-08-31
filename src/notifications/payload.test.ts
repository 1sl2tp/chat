import { describe, expect, it } from 'vitest'
import { parsePushPayload } from './payload'

describe('push payload parsing', () => {
  it('keeps only notification fields used by the client', () => {
    expect(parsePushPayload({
      title: 'Cuộc gọi đến',
      body: 'Khách hàng đang gọi',
      navigate: './?call=123',
      badge: 3,
      tag: 'call-123',
      token: 'must-not-leak',
    })).toEqual({
      title: 'Cuộc gọi đến',
      body: 'Khách hàng đang gọi',
      navigate: './?call=123',
      badge: 3,
      tag: 'call-123',
    })
  })

  it('falls back to safe defaults for malformed payloads', () => {
    expect(parsePushPayload(null)).toEqual({
      title: 'Chat',
      body: '',
      navigate: './',
      badge: undefined,
      tag: undefined,
    })
  })
})
