const BOTTOM_THRESHOLD = 72

export function isNearBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= BOTTOM_THRESHOLD
}

export interface ConversationScrollController {
  capturePosition(): void
  onViewportChange(): void
  onMessagesChanged(): void
  onComposerFocus(): void
  isFollowingBottom(): boolean
  scrollToBottom(): void
}

export function createConversationScrollController(scroller: HTMLElement): ConversationScrollController {
  let keepBottom = true

  const capturePosition = () => {
    keepBottom = isNearBottom(scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight)
  }

  const applyScrollToBottom = () => {
    scroller.scrollTop = scroller.scrollHeight
  }

  const scrollToBottom = () => {
    keepBottom = true
    requestAnimationFrame(applyScrollToBottom)
  }

  scroller.addEventListener('scroll', capturePosition, { passive: true })

  return {
    capturePosition,
    onViewportChange() {
      if (keepBottom) requestAnimationFrame(applyScrollToBottom)
    },
    onMessagesChanged() {
      if (keepBottom) requestAnimationFrame(applyScrollToBottom)
    },
    onComposerFocus() {
      scrollToBottom()
    },
    isFollowingBottom() {
      return keepBottom
    },
    scrollToBottom,
  }
}
