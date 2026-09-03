import { describe, expect, it } from 'vitest'
import adminShellSource from '../admin-shell.ts?raw'
import adminCleanSource from '../admin-clean-main.ts?raw'

describe('Clean Hỗ trợ Inbox production mount path', () => {
  it('mounts the clean Admin owner directly', () => {
    expect(adminShellSource).toContain("import './ui/clean/theme.css'")
    expect(adminShellSource).toContain("import './admin-clean-main'")
    expect(adminCleanSource).toContain('createCleanAdminWorkspace')
    expect(adminCleanSource).toContain('mountCleanChatSurface')
    expect(adminCleanSource).toContain('selectAdminConversation')
    expect(adminCleanSource).toContain('clearAdminSelection')
  })

  it('keeps legacy management and decorator owners out of the production shell', () => {
    expect(adminShellSource).not.toContain('chatwoot-management-ui')
    expect(adminShellSource).not.toContain('mountAdminChatwootManagementUi')
    expect(adminShellSource).not.toContain('mountAdminManagementUi')
    expect(adminShellSource).not.toContain('mountAdminZaloPolish')
    expect(adminShellSource).not.toContain('zalo-polish')
  })
})
