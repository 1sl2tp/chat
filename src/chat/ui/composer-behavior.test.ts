import { describe, expect, it } from 'vitest'
import { composerEnterAction } from './composer-behavior'

describe('composerEnterAction', () => {
  it('sends with Enter on desktop', () => {
    expect(composerEnterAction({ isMobile: false, shiftKey: false })).toBe('send')
  })

  it('inserts a newline with Shift+Enter on desktop', () => {
    expect(composerEnterAction({ isMobile: false, shiftKey: true })).toBe('newline')
  })

  it('inserts a newline with Enter on mobile', () => {
    expect(composerEnterAction({ isMobile: true, shiftKey: false })).toBe('newline')
  })
})
