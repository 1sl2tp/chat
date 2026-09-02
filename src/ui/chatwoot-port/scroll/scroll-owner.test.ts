import { describe, expect, it } from 'vitest'
import { createScrollOwner } from './scroll-owner'

class FakeTimeline {
  scrollTop = 0
  scrollHeight = 1000
  clientHeight = 400
  addEventListener() {}
  removeEventListener() {}
}

describe('Chatwoot scroll owner', () => {
  it('scrolls to true latest on initial render, composer focus and local send', () => {
    const timeline = new FakeTimeline()
    const owner = createScrollOwner({ timeline: timeline as unknown as HTMLElement })
    owner.onInitialRender()
    expect(timeline.scrollTop).toBe(1000)
    timeline.scrollTop = 100
    owner.onComposerFocus()
    expect(timeline.scrollTop).toBe(1000)
    timeline.scrollTop = 100
    owner.onLocalMessageSent()
    expect(timeline.scrollTop).toBe(1000)
  })

  it('does not yank the user down for remote messages while reading history', () => {
    const timeline = new FakeTimeline()
    let newMessageVisible = false
    const owner = createScrollOwner({
      timeline: timeline as unknown as HTMLElement,
      onNewMessageVisibilityChange: value => { newMessageVisible = value },
    })
    timeline.scrollTop = 100
    owner.onUserScroll()
    owner.onRemoteMessageAdded()
    expect(timeline.scrollTop).toBe(100)
    expect(newMessageVisible).toBe(true)
  })

  it('keeps bottom anchoring after async media resize only while sticky', () => {
    const timeline = new FakeTimeline()
    const owner = createScrollOwner({ timeline: timeline as unknown as HTMLElement })
    owner.onInitialRender()
    timeline.scrollHeight = 1200
    owner.onTimelineResize()
    expect(timeline.scrollTop).toBe(1200)

    timeline.scrollTop = 100
    owner.onUserScroll()
    timeline.scrollHeight = 1400
    owner.onTimelineResize()
    expect(timeline.scrollTop).toBe(100)
  })
})
