import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const html = readFileSync(new URL('../public/demo/index.html', import.meta.url), 'utf8')

describe('demo user shell geometry', () => {
  test('keeps the desktop shell at the viewport height instead of visualViewport height', () => {
    expect(html).toContain('.app{position:fixed;top:0;')
    expect(html).toContain('height:100dvh')
    expect(html).not.toContain('--app-h')
    expect(html).not.toContain('--app-top')
  })

  test('keeps the account header single-line and lets User 1 have no call control', () => {
    expect(html).not.toContain('id="accountSub"')
    expect(html).toContain('id="callBtn" hidden')
    expect(html).toContain("$('callBtn').hidden=!user")
  })

  test('only applies visualViewport compensation while the message field is actually focused', () => {
    expect(html).toContain("matchMedia('(max-width: 600px)')")
    expect(html).toContain("const composerFocused=document.activeElement===$('messageInput')")
    expect(html).toContain('const keyboardOpen=mobile.matches&&composerFocused&&delta>120')
    expect(html).toContain("style.setProperty('--keyboard-offset',keyboardOpen?delta+'px':'0px')")
    expect(html).toContain("$('messageInput').addEventListener('blur',syncViewport)")
  })

  test('uses one icon contract across the top and composer controls', () => {
    expect(html).toContain('--icon-size:24px')
    expect(html).toContain('.ui-icon{width:var(--icon-size);height:var(--icon-size)')
  })
})
