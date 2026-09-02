import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync('src/ui/chatwoot-port/composer/composer.ts', 'utf8')
const css = fs.readFileSync('src/ui/chatwoot-port/composer/composer.css', 'utf8')

describe('approved reference composer presentation', () => {
  it('ports the reference attach | input+mic | send composition', () => {
    expect(source).toContain('cw-composer__input-wrap')
    expect(source).toContain('cw-composer__button--voice')
    expect(source).toContain('cw-composer__button--send')
    expect(source).toContain('fa-paperclip')
    expect(source).toContain('fa-microphone')
    expect(source).toContain('fa-paper-plane')
  })

  it('uses the exact reference dark surfaces and Chatwoot blue send action', () => {
    expect(css).toContain('background: #0f172a')
    expect(css).toContain('.cw-composer__input-wrap')
    expect(css).toContain('background: #020617')
    expect(css).toContain('border: 1px solid #1e293b')
    expect(css).toContain('background: #1f93ff')
  })

  it('keeps the iOS no-zoom 16px input contract', () => {
    expect(css).toMatch(/\.cw-composer__input\s*\{[^}]*font-size:\s*16px/s)
  })
})
