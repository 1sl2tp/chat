import { sendChatAttachment, sendChatText, startChatMessagesForConversation, stopChatMessages } from '../chat/message-runtime'
import { ChatReactionSession } from '../chat/reactions/session'
import { createSupabaseAdminBackend } from '../supabase/admin-backend'
import { createSupabaseAttachmentTransport, createSignedAttachmentUrl } from '../supabase/attachment-transport'
import { adminSupabase } from '../supabase/client'
import { createSupabaseMessageBackend } from '../supabase/message-backend'
import { createSupabaseReactionBackend } from '../supabase/reaction-backend'
import { clearConversationCapabilities, setConversationCapabilities } from '../ui/chat/capabilities'
import { getBootstrappedAdminProfileId } from './bootstrap'
import type { AdminBackend } from './contracts'
import { createAdminInboxWatcher, type AdminInboxWatcher } from './inbox-realtime'
import { getAdminState, setAdminState } from './store'

export interface AdminMessageRuntime {
  start(conversationId: string): Promise<void>
  stop(): void
}

const sharedMessageBackend = createSupabaseMessageBackend(adminSupabase)

function createDefaultMessageRuntime(): AdminMessageRuntime {
  return {
    start: (conversationId) => startChatMessagesForConversation(sharedMessageBackend, conversationId),
    stop: () => stopChatMessages(),
  }
}

let activeBackend: AdminBackend = createSupabaseAdminBackend(adminSupabase)
let messageRuntime: AdminMessageRuntime = createDefaultMessageRuntime()
let inboxWatcher: AdminInboxWatcher = createAdminInboxWatcher()
let refreshInFlight: Promise<void> | null = null
let refreshRequested = false
let capabilityToken: symbol | null = null
let reactionSession: ChatReactionSession | null = null

function clearSurfaceCapabilities(): void {
  reactionSession?.dispose()
  reactionSession = null
  if (capabilityToken) clearConversationCapabilities(capabilityToken)
  capabilityToken = null
}

function registerSurfaceCapabilities(): void {
  clearSurfaceCapabilities()
  const profileId = getBootstrappedAdminProfileId()
  if (!profileId) return

  const transport = createSupabaseAttachmentTransport(adminSupabase)
  reactionSession = new ChatReactionSession(createSupabaseReactionBackend(adminSupabase))
  capabilityToken = setConversationCapabilities({
    async sendAttachment(file) {
      const message = await sendChatAttachment(transport, profileId, file)
      await refreshAdminInbox()
      return message
    },
    resolveAttachmentUrl(path) {
      return createSignedAttachmentUrl(adminSupabase, path)
    },
    reactionSession,
  })
}

export function configureAdminRuntimeForTests(
  backend: AdminBackend,
  messages: AdminMessageRuntime,
  watcher?: AdminInboxWatcher,
): void {
  activeBackend = backend
  messageRuntime = messages
  if (watcher) inboxWatcher = watcher
  refreshInFlight = null
  refreshRequested = false
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
    inboxWatcher.start(() => {
      void refreshAdminInbox()
    })
    registerSurfaceCapabilities()
  } catch (error) {
    clearSurfaceCapabilities()
    setAdminState({
      ...getAdminState(),
      phase: 'error',
      error: error instanceof Error ? error.message : 'Admin inbox failed',
    })
    throw error
  }
}

export function stopAdminRuntime(): void {
  inboxWatcher.stop()
  messageRuntime.stop()
  clearSurfaceCapabilities()
  refreshRequested = false
}

async function loadInboxOnce(): Promise<void> {
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

export async function refreshAdminInbox(): Promise<void> {
  refreshRequested = true
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    while (refreshRequested) {
      refreshRequested = false
      await loadInboxOnce()
    }
  })()

  try {
    await refreshInFlight
  } finally {
    refreshInFlight = null
    if (refreshRequested) await refreshAdminInbox()
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

export async function sendAdminText(text: string): Promise<void> {
  await sendChatText(sharedMessageBackend, text)
  await refreshAdminInbox()
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
