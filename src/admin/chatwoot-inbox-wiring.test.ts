import { describe, expect, it } from 'vitest'
import adminShellSource from '../admin-shell.ts?raw'

describe('Chatwoot Hỗ trợ Inbox production mount path', () => {
  it('mounts the Chatwoot Inbox owner directly', () => {
    expect(adminShellSource).toContain("from './admin/chatwoot-management-ui'")
    expect(adminShellSource).toContain('mountAdminChatwootManagementUi()')
    expect(adminShellSource).not.toContain('presentation-switch')
  })

  it('keeps legacy management and Zalo decorators out of the production shell', () => {
    expect(adminShellSource).not.toContain('mountAdminManagementUi')
    expect(adminShellSource).not.toContain('mountAdminZaloPolish')
    expect(adminShellSource).not.toContain("from './admin/zalo-polish'")
    expect(adminShellSource).not.toContain("import './admin/zalo-polish.css'")
  })
})
