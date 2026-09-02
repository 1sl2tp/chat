export type ComposerEnterAction = 'send' | 'newline'

export interface ComposerEnterInput {
  isMobile: boolean
  shiftKey: boolean
}

export function composerEnterAction(input: ComposerEnterInput): ComposerEnterAction {
  if (input.isMobile || input.shiftKey) return 'newline'
  return 'send'
}

export function isMobileComposerEnvironment(win: Window = window): boolean {
  return win.matchMedia('(hover: none) and (pointer: coarse)').matches
}
