export type DrawerGestureAction = 'open' | 'close' | 'none'

export interface DrawerGestureSample {
  open: boolean
  startX: number
  startY: number
  endX: number
  endY: number
  openEdgePx?: number
}

const EDGE_PX = 28
const SWIPE_PX = 56
const HORIZONTAL_BIAS = 1.2

export function drawerGestureAction(sample: DrawerGestureSample): DrawerGestureAction {
  const dx = sample.endX - sample.startX
  const dy = sample.endY - sample.startY
  if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) return 'none'

  if (!sample.open) {
    const edgePx = sample.openEdgePx ?? EDGE_PX
    return sample.startX <= edgePx && dx > 0 ? 'open' : 'none'
  }

  return dx < 0 ? 'close' : 'none'
}

export interface EdgeDrawerGestureOptions {
  isOpen(): boolean
  onOpen(): void
  onClose(): void
  openEdgePx?: number
}

export function installEdgeDrawerGesture(
  target: HTMLElement | Document,
  options: EdgeDrawerGestureOptions,
): () => void {
  let pointerId: number | null = null
  let startX = 0
  let startY = 0

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const edgePx = options.openEdgePx ?? EDGE_PX
    if (!options.isOpen() && event.clientX > edgePx) return
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
  }

  const onPointerUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return
    const action = drawerGestureAction({
      open: options.isOpen(),
      startX,
      startY,
      endX: event.clientX,
      endY: event.clientY,
      openEdgePx: options.openEdgePx,
    })
    pointerId = null
    if (action === 'open') options.onOpen()
    if (action === 'close') options.onClose()
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (pointerId === event.pointerId) pointerId = null
  }

  target.addEventListener('pointerdown', onPointerDown as EventListener, { passive: true })
  target.addEventListener('pointerup', onPointerUp as EventListener, { passive: true })
  target.addEventListener('pointercancel', onPointerCancel as EventListener, { passive: true })

  return () => {
    target.removeEventListener('pointerdown', onPointerDown as EventListener)
    target.removeEventListener('pointerup', onPointerUp as EventListener)
    target.removeEventListener('pointercancel', onPointerCancel as EventListener)
  }
}
