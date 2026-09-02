/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import facadeSource from './ui.ts?raw'
import widgetSource from '../ui/chatwoot-port/call/call-widget.ts?raw'

const css = readFileSync(new URL('../ui/chatwoot-port/call/call-widget.css', import.meta.url), 'utf8')

describe('shared Chatwoot Call product presentation', () => {
  it('uses the approved reference Font Awesome controls instead of raw glyph controls', () => {
    for (const className of [
      'fa-solid fa-phone',
      'fa-solid fa-phone-slash',
      'fa-solid fa-microphone-slash',
      'fa-solid fa-microphone',
      'fa-solid fa-volume-high',
    ]) {
      expect(widgetSource).toContain(className)
    }
    expect(widgetSource).not.toMatch(/[☎🔊🔇🎙✕⌄]/u)
  })

  it('uses the shared CallWidget with full compact and hidden presentation states', () => {
    expect(widgetSource).toContain("widget.className = 'cw-call-widget'")
    expect(widgetSource).toContain("card.className = 'cw-call-card'")
    expect(widgetSource).toContain("state.display === 'compact'")
    expect(widgetSource).toContain("state.display === 'hidden'")
    expect(css).toContain('.cw-call-widget')
    expect(css).toContain('.cw-call-card')
    expect(css).toContain('.cw-call-compact')
    expect(css).toContain('.cw-call-hidden')
    expect(css).toContain('border-radius: 16px')
    expect(facadeSource).not.toContain('voice-call-full')
    expect(facadeSource).not.toContain('voice-call-pill')
  })

  it('keeps the old runtime export only as a facade to the Chatwoot visible owner', () => {
    expect(facadeSource).toContain('mountChatwootCallUi')
    expect(facadeSource).toContain('export const mountVoiceCallUi = mountChatwootCallUi')
  })
})
