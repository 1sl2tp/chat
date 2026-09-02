import { describe, expect, it } from 'vitest'
import composerSource from './composer.ts?raw'
import surfaceSource from './surface.ts?raw'
import scrollSource from './scroll-controller.ts?raw'

describe('composer focus scroll contract', () => {
  it('notifies the conversation surface when the textarea receives focus', () => {
    expect(composerSource).toContain('onFocus?: () => void')
    expect(composerSource).toContain("input.addEventListener('focus'")
    expect(composerSource).toContain('options.onFocus?.()')
  })

  it('forces bottom anchoring when composer receives focus', () => {
    expect(scrollSource).toContain('onComposerFocus(): void')
    expect(scrollSource).toContain('keepBottom = true')
    expect(surfaceSource).toContain('onFocus: () => {')
    expect(surfaceSource).toContain('scroll.onComposerFocus()')
  })
})
