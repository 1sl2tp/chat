import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const userMain = fs.readFileSync('src/user-main.ts', 'utf8')
const userCss = fs.readFileSync('src/user.css', 'utf8')
const accountCss = fs.readFileSync('src/ui/chatwoot-port/account/account.css', 'utf8')

describe('approved reference User shell', () => {
  it('keeps only real User chat/account/notification surfaces', () => {
    expect(userMain).toContain('user-drawer')
    expect(userMain).toContain('call-notifications')
    expect(userMain).toContain('password-change-form')
    expect(userMain).toContain('voice-call-host')
    expect(userMain).not.toContain('Báo cáo')
    expect(userMain).not.toContain('Automation')
    expect(userMain).not.toContain('Khách hàng CRM')
  })

  it('uses the approved dark reference drawer/login shell', () => {
    expect(userCss).toContain('body{background:#020617')
    expect(userCss).toContain('.user-drawer-panel')
    expect(userCss).toContain('background:#0f172a')
    expect(userCss).toContain('border-color:#1e293b')
  })

  it('uses the same Slate/CW presentation for account groups', () => {
    expect(accountCss).toContain('background: #0f172a')
    expect(accountCss).toContain('color: #f8fafc')
    expect(accountCss).toContain('#1f93ff')
  })
})
