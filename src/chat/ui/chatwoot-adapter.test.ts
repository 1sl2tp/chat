import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../messages'
import {
  toConversationActionsAdapter,
  toConversationViewModel,
  type ConversationActor,
  type ExistingConversationRuntimeActions,
} from './chatwoot-adapter'

function textMessage(id: string, senderId: string, text: string): ChatMessage {
  return {
    id,
    conversation_id: 'c-1',
    sender_id: senderId,
    client_message_id: `client-${id}`,
    type: 'text',
    text,
    reply_to_id: null,
    created_at: '2026-09-02T12:00:00.000Z',
    edited_at: null,
    revoked_at: null,
    call_id: null,
  }
}

function runtimeActions(overrides: Partial<ExistingConversationRuntimeActions> = {}): ExistingConversationRuntimeActions {
  return {
    canSend: true,
    canAttach: true,
    canRecord: true,
    canCall: true,
    sendText: vi.fn(async () => undefined),
    sendAttachment: vi.fn(async () => undefined),
    startVoiceRecording: vi.fn(async () => undefined),
    stopVoiceRecording: vi.fn(async () => undefined),
    startCall: vi.fn(async () => undefined),
    ...overrides,
  }
}

function actorFixture(actor: ConversationActor, currentProfileId: string) {
  return toConversationViewModel({
    actor,
    conversationId: 'c-1',
    title: actor === 'admin' ? 'Khách A' : 'Hỗ trợ',
    subtitle: actor === 'user1' ? 'User 1 · Vãng lai' : actor === 'user2' ? 'User 2' : 'User 2 · @khacha',
    canCall: actor !== 'user1',
    currentProfileId,
    messages: [
      textMessage('mine', currentProfileId, 'Tin của tôi'),
      textMessage('peer', actor === 'admin' ? 'user-2' : 'support', 'Tin phía kia'),
      { ...textMessage('system', 'system', 'Hệ thống'), type: 'system' },
      { ...textMessage('call', 'system', 'Cuộc gọi đã kết thúc'), type: 'call', call_id: 'call-1' },
    ],
  })
}

describe('Chatwoot runtime adapter', () => {
  it.each([
    ['user1', 'u1', false],
    ['user2', 'u2', true],
    ['admin', 'admin-1', true],
  ] as const)('maps directions and call visibility correctly for %s', (actor, currentProfileId, canCall) => {
    const model = actorFixture(actor, currentProfileId)

    expect(model.id).toBe('c-1')
    expect(model.canCall).toBe(canCall)
    expect(model.messages.map(message => message.direction)).toEqual(['outgoing', 'incoming', 'center', 'center'])
    expect(model.messages.map(message => message.kind)).toEqual(['text', 'text', 'system', 'call'])
  })

  it('blocks unavailable User 1 call capability but keeps chat actions available', async () => {
    const sendText = vi.fn(async () => undefined)
    const startCall = vi.fn(async () => undefined)
    const adapter = toConversationActionsAdapter(runtimeActions({ canCall: false, sendText, startCall }))

    await adapter.sendText('Xin chào')
    await expect(adapter.startCall()).rejects.toThrow('call_unavailable')
    expect(sendText).toHaveBeenCalledWith('Xin chào')
    expect(startCall).not.toHaveBeenCalled()
  })

  it.each(['user2', 'admin'] as const)('keeps call capability for %s runtime', async () => {
    const startCall = vi.fn(async () => undefined)
    const adapter = toConversationActionsAdapter(runtimeActions({ canCall: true, startCall }))

    await adapter.startCall()
    expect(startCall).toHaveBeenCalledTimes(1)
  })
})
