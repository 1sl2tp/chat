import type { SupabaseClient } from '@supabase/supabase-js'
import { getDeviceLabel, getDevicePlatform, getOrCreateDeviceKey } from '../device/identity'
import { createSupabaseChatBackend } from '../supabase/chat-backend'
import { createSupabaseMessageBackend } from '../supabase/message-backend'
import { supabase } from '../supabase/client'
import { bootstrapChat } from './bootstrap'
import { sendChatText, startChatMessages, stopChatMessages } from './message-runtime'
import { setChatRuntimeState } from './store'

let started = false
let activeClient: SupabaseClient | null = null

export interface ChatRuntimeOptions {
  client?: SupabaseClient
  deviceKey?: string
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
  } catch (error) {
    started = false
    activeClient = null
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
  stopChatMessages()
  setChatRuntimeState({ phase: 'idle', identity: null, supportEntry: null, error: null })
}
