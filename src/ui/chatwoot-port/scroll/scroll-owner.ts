export interface ScrollOwner {
  onInitialRender(): void
  onComposerFocus(): void
  onLocalMessageSent(): void
  onRemoteMessageAdded(): void
  onTimelineResize(): void
  onUserScroll(): void
  scrollToLatest(): void
  destroy(): void
}

export interface ScrollOwnerOptions {
  timeline: HTMLElement
  resizeTarget?: Element
  bottomThreshold?: number
  onNewMessageVisibilityChange?: (visible: boolean) => void
}

export function createScrollOwner(options: ScrollOwnerOptions): ScrollOwner {
  const threshold = options.bottomThreshold ?? 72
  let sticky = true
  let destroyed = false

  const isNearBottom = () =>
    options.timeline.scrollHeight - options.timeline.clientHeight - options.timeline.scrollTop <= threshold

  const setNewMessageVisible = (visible: boolean) => options.onNewMessageVisibilityChange?.(visible)

  const scrollToLatest = () => {
    if (destroyed) return
    sticky = true
    options.timeline.scrollTop = options.timeline.scrollHeight
    setNewMessageVisible(false)
  }

  const onUserScroll = () => {
    if (destroyed) return
    sticky = isNearBottom()
    if (sticky) setNewMessageVisible(false)
  }

  options.timeline.addEventListener('scroll', onUserScroll, { passive: true })

  let observer: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined' && options.resizeTarget) {
    observer = new ResizeObserver(() => {
      if (sticky) scrollToLatest()
    })
    observer.observe(options.resizeTarget)
  }

  return {
    onInitialRender: scrollToLatest,
    onComposerFocus: scrollToLatest,
    onLocalMessageSent: scrollToLatest,
    onRemoteMessageAdded() {
      if (sticky || isNearBottom()) scrollToLatest()
      else setNewMessageVisible(true)
    },
    onTimelineResize() {
      if (sticky) scrollToLatest()
    },
    onUserScroll,
    scrollToLatest,
    destroy() {
      destroyed = true
      observer?.disconnect()
      observer = null
      options.timeline.removeEventListener('scroll', onUserScroll)
    },
  }
}
