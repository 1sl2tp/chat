import { describe, expect, it } from 'vitest'
import adminShellSource from '../admin-shell.ts?raw'

describe('Chatwoot Admin Inbox mount path', () => {
  it('selects the Chatwoot Inbox owner behind the presentation switch', () => {
    expect(adminShellSource).toContain("from './ui/chatwoot-port/presentation-switch'")
    expect(adminShellSource).toContain("from './admin/chatwoot-management-ui'")
    expect(adminShellSource).toContain('mountAdminChatwootManagementUi')
    expect(adminShellSource).toContain("getChatPresentation() === 'chatwoot-port'")
  })

  it('keeps the legacy decorator out of the Chatwoot presentation path', () => {
    const branchIndex = adminShellSource.indexOf("getChatPresentation() === 'chatwoot-port'")
    const legacyPolishIndex = adminShellSource.indexOf('mountAdminZaloPolish()', branchIndex)
    expect(branchIndex).toBeGreaterThanOrEqual(0)
    expect(legacyPolishIndex).toBeGreaterThan(branchIndex)
    expect(adminShellSource.slice(branchIndex, legacyPolishIndex)).toContain('else')
  })
})
