import type { ChatMessage } from '../messages'
import type {
  ConversationActionsAdapter,
  ConversationViewModel,
  MessageKind,
  MessageViewModel,
} from '../../ui/chatwoot-port/contracts'

export type ConversationActor = 'user1' | 'user2' | 'admin'

export interface ExistingConversationRuntimeState {
  actor: ConversationActor
  conversationId: string | null
  title: string
  subtitle?: string
  canCall?: boolean
  messages: ChatMessage[]
  currentProfileId: string | null
  attachmentUrls?: Readonly<Record<string, string>>
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

function kindForMessage(message: ChatMessage): MessageKind {
  if (message.type === 'system') return 'system'
  if (message.type === 'call') return 'call'
  if (message.attachment?.kind === 'image') return 'image'
  if (message.attachment?.kind === 'audio') return 'audio'
  if (message.attachment?.kind === 'file') return 'file'
  return 'text'
}

function toMessageViewModel(
  message: ChatMessage,
  currentProfileId: string | null,
  attachmentUrls: Readonly<Record<string, string>>,
): MessageViewModel {
  const kind = kindForMessage(message)
  const center = kind === 'system' || kind === 'call'
  const direction = center
    ? 'center'
    : currentProfileId !== null && message.sender_id === currentProfileId
      ? 'outgoing'
      : 'incoming'

  const attachment = message.attachment
    ? {
        url: attachmentUrls[message.attachment.path] ?? message.attachment.path,
        name: message.attachment.name,
        mimeType: message.attachment.mime,
        size: message.attachment.size,
        width: message.attachment.width,
        height: message.attachment.height,
      }
    : undefined

  return {
    id: message.id,
    kind,
    direction,
    senderId: center ? undefined : message.sender_id,
    text: message.revoked_at ? 'Tin nhắn đã được thu hồi' : message.text ?? undefined,
    createdAt: message.created_at,
    callId: message.call_id ?? undefined,
    durationSeconds: message.attachment?.duration_ms === undefined
      ? undefined
      : Math.max(0, message.attachment.duration_ms / 1000),
    attachment,
  }
}

export function toConversationViewModel(state: ExistingConversationRuntimeState): ConversationViewModel {
  const attachmentUrls = state.attachmentUrls ?? {}
  return {
    id: state.conversationId ?? '',
    title: state.title,
    subtitle: state.subtitle,
    canCall: state.canCall ?? false,
    messages: state.messages.map(message => toMessageViewModel(message, state.currentProfileId, attachmentUrls)),
  }
}

function requireCapability(enabled: boolean, code: string): void {
  if (!enabled) throw new Error(code)
}

export function toConversationActionsAdapter(runtime: ExistingConversationRuntimeActions): ConversationActionsAdapter {
  return {
    async sendText(text) {
      requireCapability(runtime.canSend, 'send_unavailable')
      await runtime.sendText(text)
    },
    async sendAttachment(file) {
      requireCapability(runtime.canAttach, 'attachment_unavailable')
      await runtime.sendAttachment(file)
    },
    async startVoiceRecording() {
      requireCapability(runtime.canRecord, 'record_unavailable')
      await runtime.startVoiceRecording()
    },
    async stopVoiceRecording() {
      requireCapability(runtime.canRecord, 'record_unavailable')
      await runtime.stopVoiceRecording()
    },
    async startCall() {
      requireCapability(runtime.canCall, 'call_unavailable')
      await runtime.startCall()
    },
  }
}
