import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const cssPath = 'src/ui/chatwoot-port/conversation-shell.css'
const tokensPath = 'src/ui/chatwoot-port/tokens.css'

describe('Chatwoot conversation geometry', () => {
  it('fills its host with the reference flex-column ownership without taking viewport ownership', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(css).toMatch(/height:\s*100%/)
    expect(css).not.toMatch(/height:\s*var\(--app-visual-height,\s*100dvh\)/)
    expect(css).toMatch(/\.cw-conversation\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s)
  })

  it('makes the timeline the only vertical scroller and composer a fixed flex row', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(css).toMatch(/\.cw-conversation__timeline\s*\{[^}]*flex:\s*1\s+1\s+auto[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s)
    expect(css).toMatch(/\.cw-conversation__composer\s*\{[^}]*flex:\s*0\s+0\s+auto[^}]*overflow:\s*visible/s)
  })

  it('defines the reference dark palette and shared spacing without User/Admin branches', () => {
    const tokens = fs.readFileSync(tokensPath, 'utf8')
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(tokens).toContain('--cw-space-3: 12px')
    expect(tokens).toContain('--cw-radius-message: 16px')
    expect(tokens).toContain('--cw-canvas: #020617')
    expect(tokens).toContain('--cw-surface: #0f172a')
    expect(css).not.toMatch(/\.user-app|\.admin-app/)
  })
})
