import { describe, expect, it } from 'vitest'
import { buildCustomerChatViewModel } from './view-model'

describe('customer chat view model', () => {
  it('maps ready support chat state without exposing technical internals', () => {
    const model = buildCustomerChatViewModel(
      { phase: 'ready', identity: { profile: { id: 'p1' }, internal: 'x' }, supportEntry: { conversation_id: 'c1' }, error: null },
      { conversationId: 'c1', messages: [], realtime: 'subscribed', error: null },
    )

    expect(model.title).toBe('Admin hỗ trợ')
    expect(model.phase).toBe('ready')
    expect(model.canSend).toBe(true)
    expect(model.currentProfileId).toBe('p1')
    expect(model).not.toHaveProperty('identity')
    expect(model).not.toHaveProperty('supportEntry')
  })
})
