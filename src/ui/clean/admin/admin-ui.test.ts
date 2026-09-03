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

  it('keeps current User management actions in one clean sheet instead of a CRM panel', () => {
    const ui = fs.readFileSync(uiPath, 'utf8')
    const main = fs.readFileSync(mainPath, 'utf8')
    expect(ui).toContain('clean-admin-manage-sheet')
    expect(ui).toContain('clean-admin-create-user')
    expect(ui).toContain('setManageOpen')
    for (const name of [
      'createUser2WithDisplayNameFromAdmin',
      'upgradeGuestFromAdmin',
      'updateUser2FromAdmin',
      'resetUser2PasswordFromAdmin',
      'deleteUserFromAdmin',
    ]) expect(main).toContain(name)
    for (const action of ['create_user2', 'upgrade_guest', 'update_user2', 'reset_password', 'delete_user']) {
      expect(main).toContain(action)
    }
    expect(main).not.toContain('mountAdminChatwootManagementUi')
  })

  it('disposes Admin store/message/call subscriptions before remounting login or workspace', () => {
    const source = fs.readFileSync(mainPath, 'utf8')
    expect(source).toContain('let stopAdminState')
    expect(source).toContain('let stopMessages')
    expect(source).toContain('let stopCallState')
    expect(source).toContain('stopAdminState?.()')
    expect(source).toContain('stopMessages?.()')
    expect(source).toContain('stopCallState?.()')
    expect(source).toContain('stopAdminRuntime()')
  })
})
