import { describe, expect, it } from 'vitest'
import userMainSource from '../../user-main.ts?raw'
import adminMainSource from '../../admin-main.ts?raw'
import userShellSource from '../../user-shell.ts?raw'
import adminShellSource from '../../admin-shell.ts?raw'
import presentationSource from './presentation-switch.ts?raw'
import messageListSource from './messages/message-list.ts?raw'

describe('Chatwoot production cutover contract', () => {
  it('makes chatwoot-port the default presentation', () => {
    expect(presentationSource).toContain("let presentation: ChatPresentation = 'chatwoot-port'")
  })

  it('removes the legacy conversation owner from production User and Hỗ trợ entries', () => {
    for (const source of [userMainSource, adminMainSource]) {
      expect(source).not.toContain("from './ui/chat/surface'")
      expect(source).not.toContain('mountConversationSurface')
      expect(source).toContain('mountConversationScreen')
    }
  })

  it('does not mount legacy account/inbox decorators from production shells', () => {
    expect(userShellSource).not.toContain('mountUserAccountUi')
    expect(userShellSource).toContain('mountUserChatwootAccountUi')

    expect(adminShellSource).not.toContain('mountAdminManagementUi')
    expect(adminShellSource).not.toContain('mountAdminZaloPolish')
    expect(adminShellSource).toContain('mountAdminChatwootManagementUi')
  })

  it('keeps exactly one call-message renderer path and no call compactor', () => {
    expect(messageListSource.match(/renderCallMessage\(message\)/g)?.length).toBe(1)
    expect(messageListSource).not.toMatch(/compactCall|callCompactor|compactCallRows/i)
  })
})
