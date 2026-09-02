import { describe, expect, it } from 'vitest'
import { clearConversationCapabilities, getConversationCapabilities, setConversationCapabilities, type ConversationCapabilities } from './capabilities'

function fixture(label: string): ConversationCapabilities {
  return {
    async sendAttachment() { throw new Error(label) },
    async resolveAttachmentUrl(path) { return `${label}:${path}` },
    reactionSession: {} as ConversationCapabilities['reactionSession'],
  }
}

describe('conversation capability registry', () => {
  it('keeps exactly one active provider and clears only the matching owner', () => {
    const user = fixture('user')
    const admin = fixture('admin')
    const userToken = setConversationCapabilities(user)
    expect(getConversationCapabilities()).toBe(user)

    const adminToken = setConversationCapabilities(admin)
    expect(getConversationCapabilities()).toBe(admin)

    clearConversationCapabilities(userToken)
    expect(getConversationCapabilities()).toBe(admin)

    clearConversationCapabilities(adminToken)
    expect(getConversationCapabilities()).toBeNull()
  })
})
