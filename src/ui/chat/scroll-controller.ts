const BOTTOM_THRESHOLD = 72

export function isNearBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= BOTTOM_THRESHOLD
}

export interface ConversationScrollController {
  capturePosition(): void
  onViewportChange(): void
  onMessagesChanged(): void
}

export function createConversationScrollController(scroller: HTMLElement): ConversationScrollController {
  let keepBottom = true

  const capturePosition = () => {
    keepBottom = isNearBottom(scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight)
  }

  const scrollToBottom = () => {
    scroller.scrollTop = scroller.scrollHeight
  }

  scroller.addEventListener('scroll', capturePosition, { passive: true })

  return {
    capturePosition,
    onViewportChange() {
      if (keepBottom) requestAnimationFrame(scrollToBottom)
    },
    onMessagesChanged() {
      if (keepBottom) requestAnimationFrame(scrollToBottom)
    },
  }
}
