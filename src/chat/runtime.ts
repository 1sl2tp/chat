import type { SupabaseClient } from '@supabase/supabase-js'
import { getDeviceLabel, getDevicePlatform, getOrCreateDeviceKey } from '../device/identity'
import { createSupabaseChatBackend } from '../supabase/chat-backend'
import { createSupabaseMessageBackend } from '../supabase/message-backend'
import { supabase } from '../supabase/client'
import { bootstrapChat } from './bootstrap'
import {
  loadOlderChatMessages,
  sendChatText,
  startChatMessages,
  stopChatMessages,
  syncChatMessages,
  type ChatMessageBackend,
} from './message-runtime'
import { getChatRuntimeState, setChatRuntimeState } from './store'

let started = false
let activeClient: SupabaseClient | null = null
let activeMessageBackend: ChatMessageBackend | null = null
let stopVisibilityListener: (() => void) | null = null

export interface ChatRuntimeOptions {
  client?: SupabaseClient
  deviceKey?: string
}

function currentProfileId(): string {
  const identity = getChatRuntimeState().identity
  if (!identity || typeof identity !== 'object') return 'local-self'

  const profile = (identity as { profile?: unknown }).profile
  if (profile && typeof profile === 'object') {
    const id = (profile as { id?: unknown }).id
    if (typeof id === 'string' && id.length > 0) return id
  }

  const directId = (identity as { id?: unknown }).id
  return typeof directId === 'string' && directId.length > 0 ? directId : 'local-self'
}

function installVisibilitySync(): void {
  stopVisibilityListener?.()
  stopVisibilityListener = null
  if (typeof document === 'undefined') return

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void syncChatMessages()
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange, { passive: true })
  stopVisibilityListener = () => document.removeEventListener('visibilitychange', onVisibilityChange)
}

export async function startChatRuntime(options: ChatRuntimeOptions = {}): Promise<void> {
  const client = options.client ?? supabase
  const deviceKey = options.deviceKey ?? getOrCreateDeviceKey('user2')

  if (started) {
    if (activeClient === client) {
      void syncChatMessages()
      return
    }
    stopChatRuntime()
  }

  started = true
  activeClient = client
  activeMessageBackend = createSupabaseMessageBackend(client)
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

    installVisibilitySync()
    await startChatMessages(activeMessageBackend, result.supportEntry)
  } catch (error) {
    started = false
    activeClient = null
    activeMessageBackend = null
    stopVisibilityListener?.()
    stopVisibilityListener = null
    stopChatMessages()
    const message = error instanceof Error ? error.message : 'Chat bootstrap failed'
    setChatRuntimeState({ phase: 'error', identity: null, supportEntry: null, error: message })
    console.error('Chat bootstrap failed', error)
  }
}

export async function sendSupportText(text: string): Promise<void> {
  const backend = activeMessageBackend ?? createSupabaseMessageBackend(activeClient ?? supabase)
  await sendChatText(backend, text, undefined, currentProfileId())
}

export async function loadOlderSupportMessages(): Promise<void> {
  await loadOlderChatMessages()
}

export async function reconcileSupportMessages(): Promise<void> {
  await syncChatMessages()
}

export function stopChatRuntime(): void {
  started = false
  activeClient = null
  activeMessageBackend = null
  stopVisibilityListener?.()
  stopVisibilityListener = null
  stopChatMessages()
  setChatRuntimeState({ phase: 'idle', identity: null, supportEntry: null, error: null })
}
