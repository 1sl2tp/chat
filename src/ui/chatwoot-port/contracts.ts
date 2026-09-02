export type UserKind = 'user1' | 'user2'

export type MessageKind = 'text' | 'image' | 'audio' | 'file' | 'link' | 'system' | 'call'

export interface MessageAttachmentViewModel {
  url: string
  name?: string
  mimeType?: string
  size?: number
  width?: number
  height?: number
}

export interface MessageViewModel {
  id: string
  kind: MessageKind
  direction: 'incoming' | 'outgoing' | 'center'
  senderId?: string
  text?: string
  createdAt: string
  callId?: string
  durationSeconds?: number
  attachment?: MessageAttachmentViewModel
  reaction?: 'heart'
}

export interface ConversationViewModel {
  id: string
  title: string
  subtitle?: string
  messages: MessageViewModel[]
}

export interface ConversationActionsAdapter {
  sendText(text: string): Promise<void>
  sendAttachment(file: File): Promise<void>
  startVoiceRecording(): Promise<void>
  stopVoiceRecording(): Promise<void>
  startCall(): Promise<void>
}
