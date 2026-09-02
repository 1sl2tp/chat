/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../chat/messages'
import { getMessageActionCapabilities } from './message-actions'
import messageListSource from './message-list.ts?raw'
import surfaceSource from './surface.ts?raw'

const chatCss = readFileSync(new URL('./surface.css', import.meta.url), 'utf8')
const userCss = readFileSync(new URL('../../user.css', import.meta.url), 'utf8')

const base: ChatMessage = {
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'p1',
  client_message_id: 'cm1',
  type: 'text',
  text: 'Xin chào',
  reply_to_id: null,
  created_at: '2026-09-02T00:00:00.000Z',
  edited_at: null,
  revoked_at: null,
  call_id: null,
  attachment: null,
}

function attachmentMessage(kind: 'image' | 'audio' | 'file'): ChatMessage {
  return {
    ...base,
    type: kind,
    text: null,
    attachment: {
      kind,
      path: `c1/p1/sample.${kind === 'image' ? 'png' : kind === 'audio' ? 'webm' : 'pdf'}`,
      name: `sample.${kind === 'image' ? 'png' : kind === 'audio' ? 'webm' : 'pdf'}`,
      mime: kind === 'image' ? 'image/png' : kind === 'audio' ? 'audio/webm' : 'application/pdf',
      size: 1024,
    },
  }
}

describe('Zalo-like media and message interaction contract', () => {
  it('keeps heart reaction for text only, never call/system/media', () => {
    expect(getMessageActionCapabilities(base).heart).toBe(true)
    expect(getMessageActionCapabilities(attachmentMessage('image')).heart).toBe(false)
    expect(getMessageActionCapabilities(attachmentMessage('audio')).heart).toBe(false)
    expect(getMessageActionCapabilities(attachmentMessage('file')).heart).toBe(false)
    expect(getMessageActionCapabilities({ ...base, type: 'call' }).heart).toBe(false)
    expect(getMessageActionCapabilities({ ...base, type: 'system' }).heart).toBe(false)
  })

  it('never renders an old reaction summary on non-text events', () => {
    expect(messageListSource).toContain('if (!getMessageActionCapabilities(message).heart) return')
  })

  it('gives the fullscreen image viewer contextual Save and Share actions', () => {
    expect(surfaceSource).toContain('chat-image-viewer__save')
    expect(surfaceSource).toContain('chat-image-viewer__share')
    expect(surfaceSource).toContain('Lưu ảnh')
    expect(surfaceSource).toContain('Chia sẻ ảnh')
  })

  it('uses a custom compact audio player instead of visible native browser controls', () => {
    expect(messageListSource).toContain('chat-audio-player__play')
    expect(messageListSource).toContain('chat-audio-player__range')
    expect(messageListSource).toContain('chat-audio-player__time')
    expect(messageListSource).not.toContain('audio.controls = true')
    expect(chatCss).toContain('.chat-audio-player{')
  })

  it('does not leave the per-message ellipsis faintly visible all the time', () => {
    expect(chatCss).toMatch(/\.chat-message__actions-toggle\{[^}]*opacity:0/)
    expect(chatCss).toContain('@media(hover:hover)')
  })

  it('keeps User conversation full-screen like Admin on desktop and mobile', () => {
    expect(userCss).toContain('.user-app{width:100%;height:var(--app-visual-height,100dvh)')
    expect(userCss).not.toContain('.user-app{border:1px solid')
  })
})
