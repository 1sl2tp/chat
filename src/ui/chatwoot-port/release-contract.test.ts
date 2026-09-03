import { describe, expect, it } from 'vitest'
import userShellSource from '../../user-shell.ts?raw'
import adminShellSource from '../../admin-shell.ts?raw'
import userCleanSource from '../../user-clean-main.ts?raw'
import adminCleanSource from '../../admin-clean-main.ts?raw'
import messageListSource from './messages/message-list.ts?raw'

describe('clean production cutover contract', () => {
  it('makes clean UI the only production shell presentation owner', () => {
    expect(userShellSource).toContain("import './ui/clean/theme.css'")
    expect(userShellSource).toContain("import './user-clean-main'")
    expect(adminShellSource).toContain("import './ui/clean/theme.css'")
    expect(adminShellSource).toContain("import './admin-clean-main'")
  })

  it('uses one shared clean conversation owner under both runtimes', () => {
    expect(userCleanSource).toContain('mountCleanChatSurface')
    expect(adminCleanSource).toContain('mountCleanChatSurface')
    expect(userCleanSource).not.toContain('mountConversationScreen')
    expect(adminCleanSource).not.toContain('mountConversationScreen')
  })

  it('does not mount legacy account, inbox, login or decorator owners from production shells', () => {
    for (const source of [userShellSource, adminShellSource]) {
      expect(source).not.toContain('chatwoot-account-ui')
      expect(source).not.toContain('chatwoot-login-ui')
      expect(source).not.toContain('chatwoot-management-ui')
      expect(source).not.toContain('mountUserAccountUi')
      expect(source).not.toContain('mountAdminManagementUi')
      expect(source).not.toContain('mountAdminZaloPolish')
    }
  })

  it('keeps exactly one legacy model call-message renderer path and no call compactor', () => {
    expect(messageListSource.match(/renderCallMessage\(message\)/g)?.length).toBe(1)
    expect(messageListSource).not.toMatch(/compactCall|callCompactor|compactCallRows/i)
  })
})
