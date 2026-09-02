/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import uiSource from './ui.ts?raw'
import iconSource from '../ui/icons.ts?raw'

const css = readFileSync(new URL('./call.css', import.meta.url), 'utf8')

describe('shared Call product presentation', () => {
  it('uses shared SVG icons for call controls instead of raw glyph controls', () => {
    for (const name of ['minimize', 'speaker', 'mute', 'unmute', 'endCall', 'acceptCall'] as const) {
      expect(iconSource).toContain(`'${name}'`)
      expect(uiSource).toContain(`iconSvg('${name}')`)
    }
    expect(uiSource).not.toMatch(/[☎🔊🔇🎙✕⌄]/u)
  })

  it('keeps hide out of the primary Call UI while preserving compact pill presentation', () => {
    expect(uiSource).not.toContain("controlButton('Ẩn'")
    expect(uiSource).not.toContain("setDisplay('hidden')")
    expect(uiSource).toContain("bar.className = 'voice-call-pill'")
    expect(css).toContain('.voice-call-pill{')
    expect(css).toContain('.voice-call-pill-main{')
  })

  it('keeps full incoming controls simpler than active controls', () => {
    const incomingIndex = uiSource.indexOf("state.phase === 'incoming'")
    const activeControlIndex = uiSource.indexOf('hasPhoneSpeakerToggle')
    expect(incomingIndex).toBeGreaterThanOrEqual(0)
    expect(activeControlIndex).toBeGreaterThan(incomingIndex)
  })
})
