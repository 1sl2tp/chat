import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./call-widget.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('./call-widget.css', import.meta.url), 'utf8')

describe('approved reference call presentation', () => {
  it('uses reference Font Awesome call controls and no raw glyphs', () => {
    expect(source).toContain('fa-solid fa-phone')
    expect(source).toContain('fa-solid fa-phone-slash')
    expect(source).toContain('fa-solid fa-microphone-slash')
    expect(source).toContain('fa-solid fa-volume-high')
    expect(source).not.toMatch(/[☎🔊🔇🎙✕⌄]/u)
  })

  it('renders the existing full compact and hidden display states', () => {
    expect(source).toContain("state.display === 'compact'")
    expect(source).toContain("state.display === 'hidden'")
    expect(source).toContain("session.setDisplay('full')")
    expect(source).toContain("session.setDisplay('compact')")
    expect(source).toContain("session.setDisplay('hidden')")
  })

  it('matches the reference mobile overlay geometry and palette', () => {
    expect(css).toContain('@media (max-width: 640px)')
    expect(css).toContain('background: rgb(2 6 23 / 95%)')
    expect(css).toContain('width: 96px')
    expect(css).toContain('height: 96px')
    expect(css).toContain('#22c55e')
    expect(css).toContain('#dc2626')
  })
})
