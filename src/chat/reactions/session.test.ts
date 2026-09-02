import { describe, expect, it } from 'vitest'
import { ChatReactionSession, type ChatReaction, type ChatReactionBackend } from './session'

function backendFixture(initial: ChatReaction[] = []) {
  let realtime: ((reaction: ChatReaction) => void) | null = null
  const setCalls: Array<{ messageId: string; emoji: string | null }> = []
  const backend: ChatReactionBackend = {
    async load() { return initial },
    subscribe(onReaction) {
      realtime = onReaction
      return () => { realtime = null }
    },
    async set(messageId, emoji) {
      setCalls.push({ messageId, emoji })
      return { message_id: messageId, profile_id: 'me', emoji, updated_at: '2026-09-02T00:01:00.000Z' }
    },
  }
  return { backend, setCalls, emit: (reaction: ChatReaction) => realtime?.(reaction) }
}

describe('ChatReactionSession', () => {
  it('counts hearts and tracks the current profile heart', async () => {
    const fixture = backendFixture([
      { message_id: 'm1', profile_id: 'me', emoji: '❤️', updated_at: '1' },
      { message_id: 'm1', profile_id: 'other', emoji: '❤️', updated_at: '2' },
      { message_id: 'm2', profile_id: 'other', emoji: null, updated_at: '3' },
    ])
    const session = new ChatReactionSession(fixture.backend)
    session.start(() => {})
    await session.sync(['m1', 'm2'], 'me')

    expect(session.getHeart('m1')).toEqual({ count: 2, mine: true })
    expect(session.getHeart('m2')).toEqual({ count: 0, mine: false })
  })

  it('applies realtime updates only to active messages and toggles my heart', async () => {
    const fixture = backendFixture([])
    const session = new ChatReactionSession(fixture.backend)
    session.start(() => {})
    await session.sync(['m1'], 'me')

    fixture.emit({ message_id: 'm1', profile_id: 'other', emoji: '❤️', updated_at: '1' })
    fixture.emit({ message_id: 'outside', profile_id: 'other', emoji: '❤️', updated_at: '1' })
    expect(session.getHeart('m1')).toEqual({ count: 1, mine: false })
    expect(session.getHeart('outside')).toEqual({ count: 0, mine: false })

    await session.toggleHeart('m1')
    expect(fixture.setCalls).toEqual([{ messageId: 'm1', emoji: '❤️' }])
    expect(session.getHeart('m1')).toEqual({ count: 2, mine: true })

    await session.toggleHeart('m1')
    expect(fixture.setCalls[1]).toEqual({ messageId: 'm1', emoji: null })
    expect(session.getHeart('m1')).toEqual({ count: 1, mine: false })
  })
})
