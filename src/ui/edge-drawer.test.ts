import { describe, expect, it } from 'vitest'
import { drawerGestureAction } from './edge-drawer'

describe('drawerGestureAction', () => {
  it('opens only from the left edge with a deliberate horizontal swipe by default', () => {
    expect(drawerGestureAction({ open: false, startX: 12, startY: 200, endX: 92, endY: 204 })).toBe('open')
    expect(drawerGestureAction({ open: false, startX: 80, startY: 200, endX: 170, endY: 200 })).toBe('none')
  })

  it('can allow a deliberate back swipe from anywhere in an open conversation', () => {
    expect(drawerGestureAction({ open: false, startX: 180, startY: 200, endX: 270, endY: 204, openEdgePx: Number.POSITIVE_INFINITY })).toBe('open')
  })

  it('does not steal vertical conversation scrolling', () => {
    expect(drawerGestureAction({ open: false, startX: 10, startY: 100, endX: 65, endY: 190 })).toBe('none')
  })

  it('closes an open drawer with a deliberate left swipe', () => {
    expect(drawerGestureAction({ open: true, startX: 180, startY: 200, endX: 105, endY: 202 })).toBe('close')
  })
})
