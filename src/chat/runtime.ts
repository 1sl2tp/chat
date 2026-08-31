import { getDeviceLabel, getDevicePlatform, getOrCreateDeviceKey } from '../device/identity'
import { createSupabaseChatBackend } from '../supabase/chat-backend'
import { createSupabaseMessageBackend } from '../supabase/message-backend'
import { bootstrapChat } from './bootstrap'
import { sendChatText, startChatMessages } from './message-runtime'
import { setChatRuntimeState } from './store'

let started = false

export async function startChatRuntime(): Promise<void> {
  if (started) return
  started = true
  setChatRuntimeState({ phase: 'loading', identity: null, supportEntry: null, error: null })

  try {
    const result = await bootstrapChat(createSupabaseChatBackend(), {
      deviceKey: getOrCreateDeviceKey(),
      label: getDeviceLabel(),
      platform: getDevicePlatform(),
    })

    setChatRuntimeState({
      phase: 'ready',
      identity: result.identity,
      supportEntry: result.supportEntry,
      error: null,
    })

    await startChatMessages(createSupabaseMessageBackend(), result.supportEntry)
  } catch (error) {
    started = false
    const message = error instanceof Error ? error.message : 'Chat bootstrap failed'
    setChatRuntimeState({ phase: 'error', identity: null, supportEntry: null, error: message })
    console.error('Chat bootstrap failed', error)
  }
}

export async function sendSupportText(text: string): Promise<void> {
  await sendChatText(createSupabaseMessageBackend(), text)
}
