import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const headerSource = fs.readFileSync(new URL('./chat-header.ts', import.meta.url), 'utf8')
const inboxSource = fs.readFileSync(new URL('./inbox/inbox.ts', import.meta.url), 'utf8')
const shellCss = fs.readFileSync(new URL('./conversation-shell.css', import.meta.url), 'utf8')
const messageCss = fs.readFileSync(new URL('./messages/message.css', import.meta.url), 'utf8')
const composerSource = fs.readFileSync(new URL('./composer/composer.ts', import.meta.url), 'utf8')
const composerCss = fs.readFileSync(new URL('./composer/composer.css', import.meta.url), 'utf8')
const callCss = fs.readFileSync(new URL('./call/call-widget.css', import.meta.url), 'utf8')
const adminCss = fs.readFileSync(new URL('../../admin.css', import.meta.url), 'utf8')

describe('PC + mobile Chatwoot visual contract', () => {
  it('uses identity avatar and online presence in the shared conversation header', () => {
    expect(headerSource).toContain('cw-chat-header__avatar')
    expect(headerSource).toContain('cw-chat-header__presence')
  })

  it('uses avatar-led rows in the Hỗ trợ inbox', () => {
    expect(inboxSource).toContain('cw-inbox__avatar')
    expect(inboxSource).toContain('cw-inbox__row-copy')
  })

  it('keeps outgoing messages blue and incoming messages neutral like the PC/mobile references', () => {
    expect(messageCss).toContain('.cw-message--outgoing .cw-message__bubble { background: #1f6feb; color: #fff; }')
    expect(messageCss).toContain('.cw-message--incoming .cw-message__bubble { background: #f1f3f5; color: #374151; }')
  })

  it('has a mobile-specific header/message geometry without creating a second runtime', () => {
    expect(shellCss).toContain('@media (max-width: 640px)')
    expect(shellCss).toContain('.cw-chat-header__avatar')
    expect(messageCss).toContain('@media (max-width: 640px)')
  })

  it('uses the mobile reference recording bar with timer and cancel/send actions', () => {
    expect(composerSource).toContain('cw-composer__recording-timer')
    expect(composerSource).toContain('Hủy')
    expect(composerSource).toContain('Gửi')
    expect(composerCss).toContain('@media (max-width: 640px)')
  })

  it('switches Hỗ trợ from PC split pane to mobile Inbox → Chat screens', () => {
    expect(adminCss).toContain('@media(max-width:640px)')
    expect(adminCss).toContain('.admin-app[data-selected="true"] .admin-inbox')
    expect(adminCss).toContain('.admin-app[data-selected="true"] .admin-chat')
  })

  it('uses a full-screen call overlay on mobile while retaining desktop call presentation', () => {
    expect(callCss).toContain('@media (max-width: 640px)')
    expect(callCss).toContain('inset: 0')
    expect(callCss).toContain('.cw-call-card__avatar')
  })
})
