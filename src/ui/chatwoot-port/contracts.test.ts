import { describe, expect, it } from 'vitest'
import type {
  ConversationActionsAdapter,
  ConversationViewModel,
  MessageViewModel,
  UserKind,
} from './contracts'

describe('Chatwoot web-port contracts', () => {
  it('supports TAPHOA user kinds and renderer-specific messages', () => {
    const user: UserKind = 'user2'
    const message: MessageViewModel = {
      id: 'm-1',
      kind: 'audio',
      direction: 'incoming',
      senderId: 'u-1',
      createdAt: '2026-09-02T11:00:00.000Z',
      attachment: {
        url: 'https://example.test/audio.m4a',
        name: 'voice.m4a',
        mimeType: 'audio/mp4',
      },
    }
    const conversation: ConversationViewModel = {
      id: 'c-1',
      title: 'Nguyễn A',
      subtitle: 'User 2 · @nguyena',
      messages: [message],
    }

    expect(user).toBe('user2')
    expect(conversation.messages[0]?.kind).toBe('audio')
  })

  it('keeps runtime actions behind an adapter boundary', () => {
    const adapter: ConversationActionsAdapter = {
      sendText: async () => undefined,
      sendAttachment: async () => undefined,
      startVoiceRecording: async () => undefined,
      stopVoiceRecording: async () => undefined,
      startCall: async () => undefined,
    }

    expect(Object.keys(adapter).sort()).toEqual(
      ['sendText', 'sendAttachment', 'startVoiceRecording', 'stopVoiceRecording', 'startCall'].sort(),
    )
  })
})
