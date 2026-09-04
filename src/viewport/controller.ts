import { deriveViewportState, type ViewportState } from './state'

export interface ViewportController {
  getState(): ViewportState
  destroy(): void
}

function isEditableTarget(value: Element | null): boolean {
  if (!(value instanceof HTMLElement)) return false
  if (value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement) return true
  return value.isContentEditable
}

export function setupViewportController(win: Window = window, doc: Document = document): ViewportController {
  const visualViewport = win.visualViewport

  const read = (): ViewportState => deriveViewportState({
    layoutHeight: win.innerHeight,
    visualHeight: visualViewport?.height ?? win.innerHeight,
    offsetTop: visualViewport?.offsetTop ?? 0,
    editing: isEditableTarget(doc.activeElement),
  })

  let state = read()

  const publish = () => {
    state = read()
    const root = doc.documentElement

    // Safari browser chrome can shrink visualViewport by >80px even when no
    // keyboard exists. Never let that move the app/composer. Only enter
    // visual-viewport mode while an editable control is actually focused.
    if (state.keyboardOpen) {
      root.style.setProperty('--app-visual-height', `${state.visualHeight}px`)
      root.style.setProperty('--app-keyboard-inset', `${state.keyboardInset}px`)
    } else {
      root.style.setProperty('--app-visual-height', '100svh')
      root.style.setProperty('--app-keyboard-inset', '0px')
    }

    root.dataset.keyboardOpen = state.keyboardOpen ? 'true' : 'false'
  }

  const onFocusChange = () => requestAnimationFrame(publish)

  visualViewport?.addEventListener('resize', publish)
  visualViewport?.addEventListener('scroll', publish)
  win.addEventListener('resize', publish)
  doc.addEventListener('focusin', onFocusChange)
  doc.addEventListener('focusout', onFocusChange)
  publish()

  return {
    getState: () => state,
    destroy() {
      visualViewport?.removeEventListener('resize', publish)
      visualViewport?.removeEventListener('scroll', publish)
      win.removeEventListener('resize', publish)
      doc.removeEventListener('focusin', onFocusChange)
      doc.removeEventListener('focusout', onFocusChange)
    },
  }
}
