import { beforeEach, describe, expect, it } from 'vitest'
import type { AdminBackend, AdminInboxItem, AdminSupportDetail } from './contracts'
import {
  clearAdminSelection,
  configureAdminRuntimeForTests,
  selectAdminConversation,
  startAdminRuntime,
  stopAdminRuntime,
} from './runtime'
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
  let inboxLoads: number
  let watcherStarts: number
  let watcherStops: number
  let triggerInboxChange: (() => void) | null

  beforeEach(() => {
    starts = []
    stops = 0
    inboxLoads = 0
    watcherStarts = 0
    watcherStops = 0
    triggerInboxChange = null
    setAdminState({ phase: 'idle', inbox: [], selectedConversationId: null, detail: null, error: null })
    const backend: AdminBackend = {
      async loadInbox() {
        inboxLoads += 1
        return inbox
      },
      async loadDetail(conversationId) { return detail(conversationId) },
    }
    configureAdminRuntimeForTests(backend, {
      async start(conversationId) { starts.push(conversationId) },
      stop() { stops += 1 },
    }, {
      start(onChange) {
        watcherStarts += 1
        triggerInboxChange = onChange
      },
      stop() {
        watcherStops += 1
        triggerInboxChange = null
      },
    })
  })

  it('loads inbox without owning message arrays', async () => {
    await startAdminRuntime()
    const state = getAdminState()
    expect(state.inbox).toEqual(inbox)
    expect('messages' in state).toBe(false)
  })

  it('starts one global inbox watcher and refreshes when messages change', async () => {
    await startAdminRuntime()
    expect(watcherStarts).toBe(1)
    expect(inboxLoads).toBe(1)

    triggerInboxChange?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(inboxLoads).toBe(2)
    expect(watcherStarts).toBe(1)
  })

  it('keeps the inbox watcher alive while switching conversations', async () => {
    await startAdminRuntime()
    await selectAdminConversation('c1')
    await selectAdminConversation('c2')

    expect(starts).toEqual(['c1', 'c2'])
    expect(stops).toBe(2)
    expect(watcherStops).toBe(0)
    expect(getAdminState().selectedConversationId).toBe('c2')
  })

  it('clears selection through shared message runtime cleanup', async () => {
    await startAdminRuntime()
    await selectAdminConversation('c1')
    clearAdminSelection()
    expect(getAdminState().selectedConversationId).toBeNull()
    expect(stops).toBe(2)
  })

  it('stops the global inbox watcher when admin runtime stops', async () => {
    await startAdminRuntime()
    stopAdminRuntime()
    expect(watcherStops).toBe(1)
  })
})
