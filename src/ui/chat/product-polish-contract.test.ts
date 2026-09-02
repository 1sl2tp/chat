/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import messageListSource from './message-list.ts?raw'
import composerSource from './composer.ts?raw'

const css = readFileSync(new URL('./surface.css', import.meta.url), 'utf8')

describe('shared Chat product polish', () => {
  it('keeps message actions hidden behind one accessible per-message menu', () => {
    expect(messageListSource).toContain('chat-message__actions-toggle')
    expect(messageListSource).toContain("iconSvg('more')")
    expect(messageListSource).toContain("setAttribute('aria-expanded'")
    expect(messageListSource).toContain('dataset.actionsOpen')
    expect(css).toContain('.chat-message__actions{')
    expect(css).toContain('opacity:0')
    expect(css).toContain('[data-actions-open=true]')
  })

  it('presents call events as system events instead of ordinary chat bubbles', () => {
    expect(messageListSource).toContain("message.type === 'call'")
  })

  it('uses product attachment containers instead of unframed browser controls', () => {
    expect(messageListSource).toContain('chat-attachment__audio-player')
    expect(messageListSource).toContain('chat-attachment__file')
    expect(messageListSource).toContain('chat-attachment__image-button')
    expect(css).toContain('.chat-attachment--image')
    expect(css).toContain('.chat-attachment--audio')
    expect(css).toContain('.chat-attachment__file')
  })

  it('keeps one rounded composer contract and the iPhone 16px input floor', () => {
    expect(composerSource).toContain("iconSvg('plus')")
    expect(composerSource).toContain("iconSvg('mic')")
    expect(composerSource).toContain("iconSvg('send')")
    expect(css).toContain('.chat-composer{')
    expect(css).toContain('border-radius:24px')
    expect(css).toContain('.chat-composer__input')
    expect(css).toContain('font-size:16px')
  })
})
