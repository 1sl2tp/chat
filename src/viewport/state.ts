export interface ViewportProbe {
  layoutHeight: number
  visualHeight: number
  offsetTop: number
}

export interface ViewportState extends ViewportProbe {
  keyboardInset: number
  keyboardOpen: boolean
}

const KEYBOARD_THRESHOLD_PX = 80

export function deriveViewportState(input: ViewportProbe): ViewportState {
  const keyboardInset = Math.max(0, Math.round(input.layoutHeight - input.visualHeight - input.offsetTop))

  return {
    ...input,
    keyboardInset,
    keyboardOpen: keyboardInset >= KEYBOARD_THRESHOLD_PX,
  }
}
