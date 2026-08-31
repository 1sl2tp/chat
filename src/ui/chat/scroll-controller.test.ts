import { describe, expect, it } from 'vitest'
import { isNearBottom } from './scroll-controller'

describe('chat scroll policy', () => {
  it('anchors when user is near bottom', () => {
    expect(isNearBottom(800, 200, 1050)).toBe(true)
  })

  it('does not anchor when user is reading older messages', () => {
    expect(isNearBottom(300, 200, 1050)).toBe(false)
  })
})
