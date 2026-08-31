import { describe, expect, it } from 'vitest'
import { deriveViewportState } from './state'

describe('viewport ownership', () => {
  it('derives keyboard occlusion from layout and visual viewport without browser-name branching', () => {
    expect(deriveViewportState({ layoutHeight: 844, visualHeight: 544, offsetTop: 0 })).toEqual({
      layoutHeight: 844,
      visualHeight: 544,
      offsetTop: 0,
      keyboardInset: 300,
      keyboardOpen: true,
    })
  })

  it('does not report a keyboard for small viewport noise', () => {
    expect(deriveViewportState({ layoutHeight: 844, visualHeight: 830, offsetTop: 0 }).keyboardOpen).toBe(false)
  })
})
