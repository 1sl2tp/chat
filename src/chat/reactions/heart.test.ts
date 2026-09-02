import { describe, expect, it } from 'vitest'
import { nextHeartReaction } from './heart'

describe('heart reaction', () => {
  it('toggles the one supported V1 reaction', () => {
    expect(nextHeartReaction(null)).toBe('❤️')
    expect(nextHeartReaction('❤️')).toBe(null)
  })
})
