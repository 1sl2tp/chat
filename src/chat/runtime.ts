import type { SupabaseClient } from '@supabase/supabase-js'
import { getDeviceLabel, getDevicePlatform, getOrCreateDeviceKey } from '../device/identity'
import { createSupabaseAttachmentTransport, createSignedAttachmentUrl } from '../supabase/attachment-transport'
import { createSupabaseChatBackend } from '../supabase/chat-backend'
import { supabase } from '../supabase/client'
import { createSupabaseMessageBackend } from '../supabase/message-backend'
import { createSupabaseReactionBackend } from '../supabase/reaction-backend'
import { clearConversationCapabilities, setConversationCapabilities } from '../ui/chat/capabilities'
import { bootstrapChat } from './bootstrap'
import { sendChatAttachment, sendChatText, startChatMessages, stopChatMessages } from './message-runtime'
import { ChatReactionSession } from './reactions/session'
import { setChatRuntimeState } from './store'

let started = false
let activeClient: SupabaseClient | null = null
let capabilityToken: symbol | null = null
let reactionSession: ChatReactionSession | null = null

export interface ChatRuntimeOptions {
  client?: SupabaseClient
  deviceKey?: string
}

function profileIdFromIdentity(identity: unknown): string {
  if (!identity || typeof identity !== 'object') return ''
  const profile = (identity as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object') return ''
  return String((profile as { id?: unknown }).id ?? '')
}

function clearSurfaceCapabilities(): void {
  reactionSession?.dispose()
  reactionSession = null
  if (capabilityToken) clearConversationCapabilities(capabilityToken)
  capabilityToken = null
}

function registerSurfaceCapabilities(client: SupabaseClient, identity: unknown): void {
  clearSurfaceCapabilities()
  const profileId = profileIdFromIdentity(identity)
  if (!profileId) return

  const transport = createSupabaseAttachmentTransport(client)
  reactionSession = new ChatReactionSession(createSupabaseReactionBackend(client))
  capabilityToken = setConversationCapabilities({
    async sendAttachment(file) {
      return sendChatAttachment(transport, profileId, file)
    },
    resolveAttachmentUrl(path) {
      return createSignedAttachmentUrl(client, path)
    },
    reactionSession,
  })
}

export async function startChatRuntime(options: ChatRuntimeOptions = {}): Promise<void> {
  const client = options.client ?? supabase
  const deviceKey = options.deviceKey ?? getOrCreateDeviceKey('user2')

  if (started) {
    if (activeClient === client) return
    stopChatRuntime()
  }

  started = true
  activeClient = client
  setChatRuntimeState({ phase: 'loading', identity: null, supportEntry: null, error: null })

  try {
    const result = await bootstrapChat(createSupabaseChatBackend(client), {
      deviceKey,
      label: getDeviceLabel(),
      platform: getDevicePlatform(),
    })

    setChatRuntimeState({
      phase: 'ready',
      identity: result.identity,
      supportEntry: result.supportEntry,
      error: null,
    })

    await startChatMessages(createSupabaseMessageBackend(client), result.supportEntry)
    registerSurfaceCapabilities(client, result.identity)
  } catch (error) {
    started = false
    activeClient = null
    clearSurfaceCapabilities()
    stopChatMessages()
    const message = error instanceof Error ? error.message : 'Chat bootstrap failed'
    setChatRuntimeState({ phase: 'error', identity: null, supportEntry: null, error: message })
    console.error('Chat bootstrap failed', error)
  }
}

export async function sendSupportText(text: string): Promise<void> {
  await sendChatText(createSupabaseMessageBackend(activeClient ?? supabase), text)
}

export function stopChatRuntime(): void {
  started = false
  activeClient = null
  clearSurfaceCapabilities()
  stopChatMessages()
  setChatRuntimeState({ phase: 'idle', identity: null, supportEntry: null, error: null })
}
