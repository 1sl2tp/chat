import { describe, expect, it } from 'vitest'
import { matchesVisibleConversation } from './window-context'

describe('matchesVisibleConversation', () => {
  it('matches only the exact visible selected conversation', () => {
    expect(matchesVisibleConversation('a', 'a', 'visible')).toBe(true)
    expect(matchesVisibleConversation('a', 'b', 'visible')).toBe(false)
    expect(matchesVisibleConversation('a', 'a', 'hidden')).toBe(false)
    expect(matchesVisibleConversation(null, 'a', 'visible')).toBe(false)
  })
})
