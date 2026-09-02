import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const css = fs.readFileSync('src/ui/chatwoot-port/messages/message.css', 'utf8')
const contracts = fs.readFileSync('src/ui/chatwoot-port/contracts.ts', 'utf8')
const adapter = fs.readFileSync('src/chat/ui/chatwoot-adapter.ts', 'utf8')
const textRenderer = fs.readFileSync('src/ui/chatwoot-port/messages/renderers/text.ts', 'utf8')

describe('approved reference message presentation', () => {
  it('uses the exact reference dark bubble colors', () => {
    expect(css).toContain('background: #1f93ff')
    expect(css).toContain('background: #1e293b')
    expect(css).toContain('border: 1px solid #334155')
    expect(css).not.toContain('background: #f1f3f5')
    expect(css).not.toContain('background: #1f6feb')
  })

  it('carries the real peer label into incoming message avatar presentation', () => {
    expect(contracts).toContain('senderLabel?: string')
    expect(adapter).toContain("senderLabel: direction === 'incoming' ? peerTitle : undefined")
    expect(textRenderer).toContain('dataSenderInitials')
    expect(css).toContain('.cw-message--incoming[data-sender-initials]::before')
  })

  it('uses nested dark cards for links/files/audio like the reference', () => {
    expect(css).toContain('.cw-link-card__preview')
    expect(css).toContain('background: #020617')
    expect(css).toContain('.cw-audio-player__play')
    expect(css).toContain('color: #f8fafc')
  })
})
