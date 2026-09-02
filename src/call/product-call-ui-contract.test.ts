/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import facadeSource from './ui.ts?raw'
import widgetSource from '../ui/chatwoot-port/call/call-widget.ts?raw'
import iconSource from '../ui/icons.ts?raw'

const css = readFileSync(new URL('../ui/chatwoot-port/call/call-widget.css', import.meta.url), 'utf8')

describe('shared Chatwoot Call product presentation', () => {
  it('uses shared SVG icons for every product Call control instead of raw glyph controls', () => {
    for (const name of ['minimize', 'speaker', 'mute', 'unmute', 'endCall', 'acceptCall'] as const) {
      expect(iconSource).toContain(`'${name}'`)
      expect(widgetSource).toContain(`'${name}'`)
    }
    expect(widgetSource).not.toMatch(/[☎🔊🔇🎙✕⌄]/u)
  })

  it('keeps Full → Thu nhỏ → compact Call pill and never exposes a primary Ẩn action', () => {
    expect(widgetSource).toContain("setDisplay('compact')")
    expect(widgetSource).toContain("setDisplay('full')")
    expect(widgetSource).not.toContain("setDisplay('hidden')")
    expect(widgetSource).not.toContain("'Ẩn'")
    expect(widgetSource).toContain("state.display === 'compact' || state.display === 'hidden'")
    expect(widgetSource).toContain('Thu nhỏ')
    expect(css).toContain('.cw-call-widget--full')
    expect(css).toContain('.cw-call-widget--compact')
    expect(css).toContain('.cw-call-card--compact')
  })

  it('keeps the existing web/phone speaker route logic in the Chatwoot owner', () => {
    expect(widgetSource).toContain('hasPhoneSpeakerToggle')
    expect(widgetSource).toContain('phoneSpeakerButtonPresentation')
    expect(widgetSource).toContain('defaultCallRouteForWeb')
    expect(widgetSource).toContain('chooseSpeaker')
  })

  it('keeps the old runtime export only as a facade to the single Chatwoot visible owner', () => {
    expect(facadeSource).toContain('mountChatwootCallUi')
    expect(facadeSource).toContain('export const mountVoiceCallUi = mountChatwootCallUi')
    expect(facadeSource).not.toContain('voice-call-full')
    expect(facadeSource).not.toContain('voice-call-pill')
  })
})
