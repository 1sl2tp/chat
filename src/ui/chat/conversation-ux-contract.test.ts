/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import composerSource from './composer.ts?raw'
import surfaceSource from './surface.ts?raw'
import scrollSource from './scroll-controller.ts?raw'

const refinementCss = readFileSync(new URL('./conversation-refinement.css', import.meta.url), 'utf8')

describe('conversation UX refinement', () => {
  it('uses one visual shell for image and audio messages instead of nested frames', () => {
    expect(refinementCss).toContain(':has(> .chat-attachment--image)')
    expect(refinementCss).toContain(':has(> .chat-attachment--audio)')
    expect(refinementCss).toContain('background:transparent')
  })

  it('shows an explicit recording state in the composer', () => {
    expect(composerSource).toContain('chat-composer__recording-status')
    expect(composerSource).toContain('Đang ghi âm')
    expect(refinementCss).toContain('.chat-composer__recording-status')
  })

  it('keeps readers in place and exposes a new-message jump control', () => {
    expect(scrollSource).toContain('isFollowingBottom(): boolean')
    expect(scrollSource).toContain('scrollToBottom(): void')
    expect(surfaceSource).toContain('chat-new-message-indicator')
    expect(surfaceSource).toContain('Tin nhắn mới')
  })
})
