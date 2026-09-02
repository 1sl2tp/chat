import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const userCss = readFileSync(new URL('./user.css', import.meta.url), 'utf8')
const conversationCss = readFileSync(new URL('./ui/chatwoot-port/conversation-shell.css', import.meta.url), 'utf8')
const chatHeaderSource = readFileSync(new URL('./ui/chatwoot-port/chat-header.ts', import.meta.url), 'utf8')

describe('User Chatwoot conversation ownership', () => {
  it('honors the hidden legacy User header so only the Chatwoot header is visible', () => {
    expect(userCss).toMatch(/\.user-header\[hidden\]\{display:none\}/)
  })

  it('lets the host own viewport height so the Chatwoot composer stays inside the User shell', () => {
    expect(conversationCss).toMatch(/\.cw-conversation\s*\{[^}]*height:\s*100%/s)
    expect(conversationCss).not.toMatch(/\.cw-conversation\s*\{[^}]*height:\s*var\(--app-visual-height,\s*100dvh\)/s)
  })

  it('moves the existing User menu action into the Chatwoot header instead of keeping a second header', () => {
    expect(chatHeaderSource).toContain("querySelector<HTMLButtonElement>('#user-menu')")
    expect(chatHeaderSource).toContain("setButtonIcon(userMenu, 'menu', 'Mở menu')")
  })
})
