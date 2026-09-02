import { describe, expect, it } from 'vitest'
import userMainSource from '../../user-main.ts?raw'
import adminMainSource from '../../admin-main.ts?raw'
import conversationScreenSource from './conversation-screen.ts?raw'

describe('Chatwoot shared conversation owner wiring', () => {
  it('mounts the same Chatwoot conversation screen from User and Hỗ trợ entries', () => {
    expect(userMainSource).toContain("from './ui/chatwoot-port/conversation-screen'")
    expect(userMainSource).toContain('mountConversationScreen')
    expect(adminMainSource).toContain("from './ui/chatwoot-port/conversation-screen'")
    expect(adminMainSource).toContain('mountConversationScreen')
  })

  it('keeps message list, ReplyBox and scroll inside the shared Conversation owner', () => {
    expect(conversationScreenSource).toContain('createMessageListView')
    expect(conversationScreenSource).toContain('createComposer')
    expect(conversationScreenSource).toContain('createScrollOwner')
  })

  it('does not let User or Hỗ trợ create a second Chatwoot composer/message-list owner', () => {
    for (const source of [userMainSource, adminMainSource]) {
      expect(source).not.toContain("from './ui/chatwoot-port/composer/composer'")
      expect(source).not.toContain("from './ui/chatwoot-port/messages/message-list'")
      expect(source).not.toContain('createComposer(')
      expect(source).not.toContain('createMessageListView(')
    }
  })
})
