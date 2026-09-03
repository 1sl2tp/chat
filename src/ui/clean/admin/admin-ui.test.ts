import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const uiPath = 'src/ui/clean/admin/admin-ui.ts'
const mainPath = 'src/admin-clean-main.ts'

describe('clean Admin app', () => {
  it('uses mutually exclusive Inbox and Chat screens instead of a permanent split pane', () => {
    const source = fs.readFileSync(uiPath, 'utf8')
    expect(source).toContain('clean-admin-inbox-screen')
    expect(source).toContain('clean-admin-chat-screen')
    expect(source).toContain('showInbox()')
    expect(source).toContain('showChat()')
    expect(source).not.toContain('class="admin-inbox"')
    expect(source).not.toContain('class="admin-chat"')
  })

  it('connects Admin runtime to clean Inbox and shared clean ChatSurface only', () => {
    const source = fs.readFileSync(mainPath, 'utf8')
    expect(source).toContain("from './ui/clean/admin/admin-ui'")
    expect(source).toContain("from './ui/clean/chat/chat-surface'")
    expect(source).toContain('clearAdminSelection')
    expect(source).toContain('selectAdminConversation')
    expect(source).not.toContain('mountConversationScreen')
    expect(source).not.toContain('mountAdminChatwootManagementUi')
    expect(source).not.toContain("import './admin.css'")
  })
})
