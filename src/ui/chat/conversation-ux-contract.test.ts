/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import composerSource from './composer.ts?raw'
import messageListSource from './message-list.ts?raw'
import surfaceSource from './surface.ts?raw'
import scrollSource from './scroll-controller.ts?raw'

const css = readFileSync(new URL('./surface.css', import.meta.url), 'utf8')

describe('conversation UX refinement', () => {
  it('uses one visual shell for media-only messages instead of nested frames', () => {
    expect(messageListSource).toContain('chat-message__bubble--media')
    expect(messageListSource).toContain('chat-message__bubble--image')
    expect(css).toContain('.chat-message__bubble--image')
    expect(css).toContain('.chat-message__bubble--audio')
  })

  it('shows an explicit recording state in the composer', () => {
    expect(composerSource).toContain('chat-composer__recording-status')
    expect(composerSource).toContain('Đang ghi âm')
    expect(css).toContain('.chat-composer__recording-status')
  })

  it('keeps readers in place and exposes a new-message jump control', () => {
    expect(scrollSource).toContain('isFollowingBottom(): boolean')
    expect(scrollSource).toContain('scrollToBottom(): void')
    expect(surfaceSource).toContain('chat-new-message-indicator')
    expect(surfaceSource).toContain('Tin nhắn mới')
  })
})
