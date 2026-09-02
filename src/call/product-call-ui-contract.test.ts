/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import facadeSource from './ui.ts?raw'
import widgetSource from '../ui/chatwoot-port/call/call-widget.ts?raw'
import iconSource from '../ui/icons.ts?raw'

const css = readFileSync(new URL('../ui/chatwoot-port/call/call-widget.css', import.meta.url), 'utf8')

describe('shared Chatwoot Call product presentation', () => {
  it('uses shared SVG icons for CallCard controls instead of raw glyph controls', () => {
    for (const name of ['speaker', 'mute', 'unmute', 'endCall', 'acceptCall'] as const) {
      expect(iconSource).toContain(`'${name}'`)
      expect(widgetSource).toContain(`'${name}'`)
    }
    expect(widgetSource).not.toMatch(/[☎🔊🔇🎙✕⌄]/u)
  })

  it('uses the Chatwoot floating CallCard rather than legacy full/pill presentation', () => {
    expect(widgetSource).toContain("widget.className = 'cw-call-widget'")
    expect(widgetSource).toContain("card.className = 'cw-call-card'")
    expect(css).toContain('.cw-call-widget')
    expect(css).toContain('.cw-call-card')
    expect(css).toContain('border-radius: 16px')
    expect(facadeSource).not.toContain('voice-call-full')
    expect(facadeSource).not.toContain('voice-call-pill')
  })

  it('keeps the old runtime export only as a facade to the Chatwoot visible owner', () => {
    expect(facadeSource).toContain('mountChatwootCallUi')
    expect(facadeSource).toContain('export const mountVoiceCallUi = mountChatwootCallUi')
  })
})
