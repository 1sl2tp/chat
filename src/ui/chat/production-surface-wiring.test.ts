import { describe, expect, it } from 'vitest'
import userMainSource from '../../user-main.ts?raw'
import adminMainSource from '../../admin-main.ts?raw'

describe('production shared Chatwoot Conversation', () => {
  it('mounts the same Chatwoot Conversation owner from User and Hỗ trợ', () => {
    for (const source of [userMainSource, adminMainSource]) {
      expect(source).toContain("from './ui/chatwoot-port/conversation-screen'")
      expect(source).toContain('mountConversationScreen')
      expect(source).not.toContain("from './ui/chat/surface'")
      expect(source).not.toContain('mountConversationSurface')
    }
  })

  it('does not keep shell-local message bubble render loops', () => {
    expect(userMainSource).not.toContain("row.className = message.sender_id")
    expect(adminMainSource).not.toContain("row.className = message.sender_id")
  })
})
