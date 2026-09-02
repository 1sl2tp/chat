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

  it('supports Zalo-like double tap heart without exposing a permanent action button', () => {
    expect(messageListSource).toContain("addEventListener('pointerup'")
    expect(messageListSource).toContain("addEventListener('dblclick'")
    expect(messageListSource).toContain('chat-message__reaction-summary')
    expect(css).toContain('touch-action:manipulation')
  })

  it('presents call events as compact system events instead of ordinary chat bubbles', () => {
    expect(messageListSource).toContain("message.type === 'call'")
    expect(messageListSource).toContain('compactCallEventMessages')
  })

  it('renders a link preview card for the first http URL in a message', () => {
    expect(messageListSource).toContain('chat-link-preview')
    expect(messageListSource).toContain('renderLinkPreview')
    expect(css).toContain('.chat-link-preview{')
  })

  it('uses product attachment containers instead of unframed browser controls', () => {
    expect(messageListSource).toContain('chat-audio-player__play')
    expect(messageListSource).toContain('chat-audio-player__range')
    expect(messageListSource).toContain('chat-attachment__file')
    expect(messageListSource).toContain('chat-attachment__image-button')
    expect(messageListSource).not.toContain('audio.controls = true')
    expect(css).toContain('.chat-attachment--image')
    expect(css).toContain('.chat-attachment--audio')
    expect(css).toContain('.chat-audio-player{')
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
