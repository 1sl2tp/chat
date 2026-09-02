import { describe, expect, it } from 'vitest'
import type { MessageViewModel } from '../contracts'
import { presentMessages } from './message-model'

const text = (id: string, senderId: string, direction: 'incoming' | 'outgoing'): MessageViewModel => ({
  id,
  kind: 'text',
  senderId,
  direction,
  text: id,
  createdAt: '2026-09-02T12:00:00Z',
})

describe('Chatwoot message grouping', () => {
  it('groups adjacent ordinary messages from the same sender and direction', () => {
    const result = presentMessages([
      text('1', 'u1', 'incoming'),
      text('2', 'u1', 'incoming'),
      text('3', 'support', 'outgoing'),
    ])

    expect(result[0]).toMatchObject({ groupWithPrevious: false, groupWithNext: true })
    expect(result[1]).toMatchObject({ groupWithPrevious: true, groupWithNext: false })
    expect(result[2]).toMatchObject({ groupWithPrevious: false, groupWithNext: false })
  })

  it('breaks groups across kind, direction, system and call boundaries', () => {
    const result = presentMessages([
      text('1', 'u1', 'incoming'),
      { ...text('2', 'u1', 'incoming'), kind: 'image' },
      { ...text('3', 'u1', 'incoming'), kind: 'system', direction: 'center' },
      { ...text('4', 'u1', 'incoming'), kind: 'call', direction: 'center' },
      text('5', 'u1', 'outgoing'),
    ])

    expect(result.every(item => !item.groupWithPrevious && !item.groupWithNext)).toBe(true)
  })
})
