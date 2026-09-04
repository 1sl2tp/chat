import type { MessageChangeKind } from '../../chat/message-runtime'

const BOTTOM_THRESHOLD = 72

export function isNearBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= BOTTOM_THRESHOLD
}

export interface ScrollChange {
  kind: MessageChangeKind
  addedCount: number
}

export interface ConversationScrollController {
  capturePosition(): void
  beforeMessagesChanged(change: ScrollChange): void
  afterMessagesChanged(change: ScrollChange): void
  onViewportChange(): void
  scrollToLatest(): void
  destroy(): void
}

export interface ConversationScrollControllerOptions {
  onUnseenChange?: (count: number) => void
}

export function createConversationScrollController(
  scroller: HTMLElement,
  options: ConversationScrollControllerOptions = {},
): ConversationScrollController {
  let keepBottom = true
  let unseenCount = 0
  let beforeTop = 0
  let beforeHeight = 0
  let beforeNearBottom = true

  const publishUnseen = () => options.onUnseenChange?.(unseenCount)

  const setUnseen = (count: number) => {
    unseenCount = Math.max(0, count)
    publishUnseen()
  }

  const capturePosition = () => {
    keepBottom = isNearBottom(scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight)
    if (keepBottom && unseenCount > 0) setUnseen(0)
  }

  const scrollToBottom = () => {
    scroller.scrollTop = scroller.scrollHeight
    keepBottom = true
    if (unseenCount > 0) setUnseen(0)
  }

  const onScroll = () => capturePosition()
  scroller.addEventListener('scroll', onScroll, { passive: true })

  return {
    capturePosition,

    beforeMessagesChanged() {
      beforeTop = scroller.scrollTop
      beforeHeight = scroller.scrollHeight
      beforeNearBottom = isNearBottom(scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight)
    },

    afterMessagesChanged(change) {
      requestAnimationFrame(() => {
        if (change.kind === 'older') {
          // Preserve the exact visual anchor when old rows are inserted above.
          const heightDelta = scroller.scrollHeight - beforeHeight
          scroller.scrollTop = beforeTop + Math.max(0, heightDelta)
          keepBottom = false
          return
        }

        if (change.kind === 'self-send') {
          scrollToBottom()
          return
        }

        if (change.kind === 'realtime' && change.addedCount > 0) {
          if (beforeNearBottom) {
            scrollToBottom()
          } else {
            keepBottom = false
            setUnseen(unseenCount + change.addedCount)
          }
          return
        }

        if (
          change.kind === 'cache' ||
          change.kind === 'sync' ||
          change.kind === 'reset'
        ) {
          if (keepBottom || beforeNearBottom) scrollToBottom()
        }
      })
    },

    onViewportChange() {
      if (keepBottom) requestAnimationFrame(scrollToBottom)
    },

    scrollToLatest() {
      requestAnimationFrame(scrollToBottom)
    },

    destroy() {
      scroller.removeEventListener('scroll', onScroll)
    },
  }
}
