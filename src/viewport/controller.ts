import { deriveViewportState, type ViewportState } from './state'

export interface ViewportController {
  getState(): ViewportState
  destroy(): void
}

export function setupViewportController(win: Window = window, doc: Document = document): ViewportController {
  const visualViewport = win.visualViewport

  const read = (): ViewportState => deriveViewportState({
    layoutHeight: win.innerHeight,
    visualHeight: visualViewport?.height ?? win.innerHeight,
    offsetTop: visualViewport?.offsetTop ?? 0,
  })

  let state = read()

  const publish = () => {
    state = read()
    const root = doc.documentElement
    root.style.setProperty('--app-visual-height', `${state.visualHeight}px`)
    root.style.setProperty('--app-keyboard-inset', `${state.keyboardInset}px`)
    root.dataset.keyboardOpen = state.keyboardOpen ? 'true' : 'false'
  }

  visualViewport?.addEventListener('resize', publish)
  visualViewport?.addEventListener('scroll', publish)
  win.addEventListener('resize', publish)
  publish()

  return {
    getState: () => state,
    destroy() {
      visualViewport?.removeEventListener('resize', publish)
      visualViewport?.removeEventListener('scroll', publish)
      win.removeEventListener('resize', publish)
    },
  }
}
