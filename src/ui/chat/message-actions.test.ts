import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../chat/messages'
import { getMessageActionCapabilities, nextHeartReaction } from './message-actions'

const base: ChatMessage = {
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'p1',
  client_message_id: 'cm1',
  type: 'text',
  text: 'Xin chào https://taphoa.xyz',
  reply_to_id: null,
  created_at: '2026-09-02T00:00:00.000Z',
  edited_at: null,
  revoked_at: null,
  call_id: null,
  attachment: null,
}

describe('message action capabilities', () => {
  it('allows heart/copy/share for a normal text message', () => {
    expect(getMessageActionCapabilities(base)).toEqual({ heart: true, copy: true, share: true, open: false })
  })

  it('allows heart/share/open for an attachment message', () => {
    expect(getMessageActionCapabilities({
      ...base,
      type: 'image',
      text: null,
      attachment: {
        kind: 'image',
        path: 'c1/p1/image.png',
        name: 'image.png',
        mime: 'image/png',
        size: 100,
      },
    })).toEqual({ heart: true, copy: false, share: true, open: true })
  })

  it('disables actions for revoked messages', () => {
    expect(getMessageActionCapabilities({ ...base, revoked_at: '2026-09-02T00:01:00.000Z' }))
      .toEqual({ heart: false, copy: false, share: false, open: false })
  })

  it('toggles only the heart reaction', () => {
    expect(nextHeartReaction(null)).toBe('❤️')
    expect(nextHeartReaction('❤️')).toBe(null)
  })
})
