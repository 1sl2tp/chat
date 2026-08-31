import type { ChatMessageRuntimeState } from '../../chat/message-runtime'
import type { ChatRuntimeState } from '../../chat/store'
import type { ChatMessage } from '../../chat/messages'

export type CustomerChatPhase = 'loading' | 'ready' | 'error'

export interface CustomerChatViewModel {
  phase: CustomerChatPhase
  title: string
  status: string
  currentProfileId: string | null
  messages: ChatMessage[]
  canSend: boolean
  error: string | null
}

function readProfileId(identity: unknown): string | null {
  if (!identity || typeof identity !== 'object') return null
  const profile = (identity as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object') return null
  const id = (profile as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : null
}

export function buildCustomerChatViewModel(
  chatState: ChatRuntimeState,
  messageState: ChatMessageRuntimeState,
): CustomerChatViewModel {
  const error = chatState.error ?? messageState.error
  const ready = chatState.phase === 'ready' && messageState.conversationId !== null

  return {
    phase: error ? 'error' : ready ? 'ready' : 'loading',
    title: 'Admin hỗ trợ',
    status: messageState.realtime === 'subscribed' ? 'Đang hoạt động' : ready ? 'Đang kết nối' : 'Đang chuẩn bị',
    currentProfileId: readProfileId(chatState.identity),
    messages: messageState.messages,
    canSend: ready,
    error,
  }
}
