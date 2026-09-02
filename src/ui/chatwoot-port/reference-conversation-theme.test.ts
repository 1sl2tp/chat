import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const screenSource = fs.readFileSync('src/ui/chatwoot-port/conversation-screen.ts', 'utf8')
const headerSource = fs.readFileSync('src/ui/chatwoot-port/chat-header.ts', 'utf8')
const tokens = fs.readFileSync('src/ui/chatwoot-port/tokens.css', 'utf8')

describe('approved reference conversation theme', () => {
  it('ports the reference center workspace utilities to the shared conversation owner', () => {
    expect(screenSource).toContain('bg-slate-950')
    expect(screenSource).toContain('overflow-hidden')
    expect(screenSource).toContain('min-w-0')
  })

  it('ports the reference 48px dark active-chat header', () => {
    expect(headerSource).toContain('h-12')
    expect(headerSource).toContain('bg-slate-900')
    expect(headerSource).toContain('border-slate-800')
    expect(headerSource).toContain('px-4')
    expect(headerSource).toContain('text-emerald-400')
  })

  it('removes the old light palette from the shared conversation tokens', () => {
    expect(tokens).toContain('--cw-canvas: #020617')
    expect(tokens).toContain('--cw-surface: #0f172a')
    expect(tokens).toContain('--cw-text: #f1f5f9')
    expect(tokens).toContain('--cw-text-muted: #94a3b8')
    expect(tokens).not.toContain('#ffffff')
    expect(tokens).not.toContain('#f8f9fb')
  })
})
