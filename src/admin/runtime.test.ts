import { beforeEach, describe, expect, it } from 'vitest'
import type { AdminBackend, AdminInboxItem, AdminSupportDetail } from './contracts'
import { clearAdminSelection, configureAdminRuntimeForTests, selectAdminConversation, startAdminRuntime } from './runtime'
import { getAdminState, setAdminState } from './store'

const inbox: AdminInboxItem[] = [{
  conversationId: 'c1',
  profileId: 'p1',
  displayName: null,
  identityType: 'anonymous',
  address: null,
  customerLastSeenAt: null,
  lastMessageAt: null,
  lastMessageText: null,
  lastMessageType: null,
  unreadCount: 1,
}]

function detail(conversationId: string): AdminSupportDetail {
  return {
    conversationId,
    profileId: `p-${conversationId}`,
    displayName: null,
    identityType: 'anonymous',
    address: null,
    customerLastSeenAt: null,
    devices: [],
  }
}

describe('admin runtime', () => {
  let starts: string[]
  let stops: number

  beforeEach(() => {
    starts = []
    stops = 0
    setAdminState({ phase: 'idle', inbox: [], selectedConversationId: null, detail: null, error: null })
    const backend: AdminBackend = {
      async loadInbox() { return inbox },
      async loadDetail(conversationId) { return detail(conversationId) },
    }
    configureAdminRuntimeForTests(backend, {
      async start(conversationId) { starts.push(conversationId) },
      stop() { stops += 1 },
    })
  })

  it('loads inbox without owning message arrays', async () => {
    await startAdminRuntime()
    const state = getAdminState()
    expect(state.inbox).toEqual(inbox)
    expect('messages' in state).toBe(false)
  })

  it('stops old messages before switching conversations', async () => {
    await startAdminRuntime()
    await selectAdminConversation('c1')
    await selectAdminConversation('c2')

    expect(starts).toEqual(['c1', 'c2'])
    expect(stops).toBe(2)
    expect(getAdminState().selectedConversationId).toBe('c2')
  })

  it('clears selection through shared message runtime cleanup', async () => {
    await startAdminRuntime()
    await selectAdminConversation('c1')
    clearAdminSelection()
    expect(getAdminState().selectedConversationId).toBeNull()
    expect(stops).toBe(2)
  })
})
