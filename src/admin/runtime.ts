import { startChatMessagesForConversation, stopChatMessages } from '../chat/message-runtime'
import { createSupabaseMessageBackend } from '../supabase/message-backend'
import { createSupabaseAdminBackend } from '../supabase/admin-backend'
import type { AdminBackend } from './contracts'
import { getAdminState, setAdminState } from './store'

export interface AdminMessageRuntime {
  start(conversationId: string): Promise<void>
  stop(): void
}

function createDefaultMessageRuntime(): AdminMessageRuntime {
  const backend = createSupabaseMessageBackend()
  return {
    start: (conversationId) => startChatMessagesForConversation(backend, conversationId),
    stop: () => stopChatMessages(),
  }
}

let activeBackend: AdminBackend = createSupabaseAdminBackend()
let messageRuntime: AdminMessageRuntime = createDefaultMessageRuntime()

export function configureAdminRuntimeForTests(
  backend: AdminBackend,
  messages: AdminMessageRuntime,
): void {
  activeBackend = backend
  messageRuntime = messages
}

export async function startAdminRuntime(): Promise<void> {
  setAdminState({ ...getAdminState(), phase: 'loading', error: null })
  try {
    const inbox = await activeBackend.loadInbox()
    setAdminState({
      phase: 'ready',
      inbox,
      selectedConversationId: null,
      detail: null,
      error: null,
    })
  } catch (error) {
    setAdminState({
      ...getAdminState(),
      phase: 'error',
      error: error instanceof Error ? error.message : 'Admin inbox failed',
    })
  }
}

export async function refreshAdminInbox(): Promise<void> {
  try {
    const inbox = await activeBackend.loadInbox()
    setAdminState({ ...getAdminState(), phase: 'ready', inbox, error: null })
  } catch (error) {
    setAdminState({
      ...getAdminState(),
      phase: 'error',
      error: error instanceof Error ? error.message : 'Admin inbox failed',
    })
  }
}

export async function selectAdminConversation(conversationId: string): Promise<void> {
  const current = getAdminState()
  if (current.selectedConversationId !== conversationId) messageRuntime.stop()

  setAdminState({
    ...current,
    phase: 'loading',
    selectedConversationId: conversationId,
    detail: null,
    error: null,
  })

  try {
    const detail = await activeBackend.loadDetail(conversationId)
    await messageRuntime.start(conversationId)
    setAdminState({ ...getAdminState(), phase: 'ready', detail, error: null })
  } catch (error) {
    setAdminState({
      ...getAdminState(),
      phase: 'error',
      error: error instanceof Error ? error.message : 'Admin conversation failed',
    })
  }
}

export function clearAdminSelection(): void {
  messageRuntime.stop()
  setAdminState({
    ...getAdminState(),
    phase: 'ready',
    selectedConversationId: null,
    detail: null,
    error: null,
  })
}
