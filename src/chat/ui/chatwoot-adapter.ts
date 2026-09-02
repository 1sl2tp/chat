import type { ChatMessage } from '../messages'
import type { ConversationActionsAdapter, ConversationViewModel } from '../../ui/chatwoot-port/contracts'

export type ConversationActor = 'user1' | 'user2' | 'admin'

export interface ExistingConversationRuntimeState {
  actor: ConversationActor
  conversationId: string | null
  title: string
  subtitle?: string
  messages: ChatMessage[]
  currentProfileId: string | null
}

export interface ExistingConversationRuntimeActions {
  canSend: boolean
  canAttach: boolean
  canRecord: boolean
  canCall: boolean
  sendText(text: string): Promise<void>
  sendAttachment(file: File): Promise<void>
  startVoiceRecording(): Promise<void>
  stopVoiceRecording(): Promise<void>
  startCall(): Promise<void>
}

export function toConversationViewModel(_state: ExistingConversationRuntimeState): ConversationViewModel {
  return { id: '', title: '', messages: [] }
}

export function toConversationActionsAdapter(_runtime: ExistingConversationRuntimeActions): ConversationActionsAdapter {
  const notImplemented = async (): Promise<void> => {
    throw new Error('chatwoot_adapter_not_implemented')
  }

  return {
    sendText: notImplemented,
    sendAttachment: notImplemented,
    startVoiceRecording: notImplemented,
    stopVoiceRecording: notImplemented,
    startCall: notImplemented,
  }
}
