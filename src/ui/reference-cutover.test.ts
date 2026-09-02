import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const activePresentationFiles = [
  'src/ui/chatwoot-port/tokens.css',
  'src/ui/chatwoot-port/conversation-shell.css',
  'src/ui/chatwoot-port/messages/message.css',
  'src/ui/chatwoot-port/composer/composer.css',
  'src/ui/chatwoot-port/inbox/inbox.css',
  'src/ui/chatwoot-port/account/account.css',
  'src/ui/chatwoot-port/auth/login-screen.css',
  'src/ui/chatwoot-port/call/call-widget.css',
  'src/admin.css',
  'src/admin/management-ui.css',
  'src/user.css',
  'src/user/account-ui.css',
] as const

const css = activePresentationFiles
  .map(path => fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '')
  .join('\n')

describe('reference presentation cutover', () => {
  it('does not retain the old light theme ownership in active UI owners', () => {
    expect(css).not.toContain('#f8f9fb')
    expect(css).not.toContain('--cw-surface: #ffffff')
    expect(css).not.toContain('--cw-canvas: #f8f9fb')
    expect(css).not.toContain('background: #f1f3f5')
  })

  it('keeps the approved TAPHOA reference palette available across the active presentation', () => {
    expect(css).toContain('#020617')
    expect(css).toContain('#0f172a')
    expect(css).toContain('#1e293b')
    expect(css).toContain('#1f93ff')
  })
})
