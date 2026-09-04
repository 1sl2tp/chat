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

  it('does not treat Safari browser chrome as a keyboard when no editable is focused', () => {
    expect(deriveViewportState({
      layoutHeight: 844,
      visualHeight: 690,
      offsetTop: 0,
      editing: false,
    }).keyboardOpen).toBe(false)
  })

  it('uses the visual viewport when an editable is focused and the keyboard really reduces it', () => {
    expect(deriveViewportState({
      layoutHeight: 844,
      visualHeight: 544,
      offsetTop: 0,
      editing: true,
    }).keyboardOpen).toBe(true)
  })
})
