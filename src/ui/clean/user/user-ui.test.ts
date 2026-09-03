import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const uiPath = 'src/ui/clean/user/user-ui.ts'
const mainPath = 'src/user-clean-main.ts'

describe('clean User app', () => {
  it('owns one chat host plus separate account and auth sheets', () => {
    expect(fs.existsSync(uiPath)).toBe(true)
    if (!fs.existsSync(uiPath)) return
    const source = fs.readFileSync(uiPath, 'utf8')
    expect(source).toContain('clean-user__chat')
    expect(source).toContain('clean-sheet')
    expect(source).toContain('clean-auth')
  })

  it('mounts the clean shared ChatSurface without legacy hidden UI', () => {
    const source = fs.readFileSync(mainPath, 'utf8')
    expect(source).toContain("from './ui/clean/chat/chat-surface'")
    expect(source).toContain("from './ui/clean/user/user-ui'")
    expect(source).not.toContain('mountConversationScreen')
    expect(source).not.toContain('legacyHeader.hidden')
    expect(source).not.toContain('composerHost.hidden')
    expect(source).not.toContain("import './user.css'")
    expect(source).not.toContain("import './call/call.css'")
  })

  it('keeps release information out of the visible User UI', () => {
    const ui = fs.readFileSync(uiPath, 'utf8')
    expect(ui).toContain('id="clean-diagnostic"')
    expect(ui).toContain('class="clean-diagnostic" hidden aria-hidden="true"')
  })

  it('preserves browser push cleanup when switching back to guest mode', () => {
    const source = fs.readFileSync(mainPath, 'utf8')
    expect(source).toContain('clearCurrentPushSubscription')
    expect(source).toContain('pushCleanupBrowserForRegistration')
    expect(source).toContain('await clearCurrentPushSubscription(pushCleanupBrowserForRegistration(registration))')
  })
})
