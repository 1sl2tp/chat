export interface ViewportProbe {
  layoutHeight: number
  visualHeight: number
  offsetTop: number
  editing?: boolean
}

export interface ViewportState extends ViewportProbe {
  keyboardInset: number
  keyboardOpen: boolean
}

const KEYBOARD_THRESHOLD_PX = 80

export function deriveViewportState(input: ViewportProbe): ViewportState {
  const keyboardInset = Math.max(0, Math.round(input.layoutHeight - input.visualHeight - input.offsetTop))
  const editing = input.editing ?? true

  return {
    ...input,
    keyboardInset,
    keyboardOpen: editing && keyboardInset >= KEYBOARD_THRESHOLD_PX,
  }
}
