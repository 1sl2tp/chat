import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const cssPath = 'src/ui/chatwoot-port/conversation-shell.css'
const tokensPath = 'src/ui/chatwoot-port/tokens.css'

describe('Chatwoot conversation geometry', () => {
  it('owns the full visual viewport with three rows', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(css).toMatch(/height:\s*var\(--app-visual-height,\s*100dvh\)/)
    expect(css).toMatch(/grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/)
  })

  it('makes the timeline the only vertical scroller and composer a fixed grid row', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(css).toMatch(/\.cw-conversation__timeline\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s)
    expect(css).toMatch(/\.cw-conversation__composer\s*\{[^}]*overflow:\s*visible/s)
  })

  it('defines Chatwoot-derived spacing/radius tokens without User/Admin branches', () => {
    const tokens = fs.readFileSync(tokensPath, 'utf8')
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(tokens).toContain('--cw-space-3: 12px')
    expect(tokens).toContain('--cw-radius-message: 16px')
    expect(css).not.toMatch(/\.user-app|\.admin-app/)
  })
})
