/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import userHtml from '../index.html?raw'
import adminHtml from '../admin/index.html?raw'
import userMainSource from './user-main.ts?raw'
import adminMainSource from './admin-main.ts?raw'
import windowContextSource from './notifications/window-context.ts?raw'
import navigationSource from './pwa/navigation.ts?raw'

const surfaceCss = readFileSync(new URL('./ui/chat/surface.css', import.meta.url), 'utf8')

function expectSafeMobileViewport(source: string): void {
  expect(source).toContain('width=device-width, initial-scale=1.0, viewport-fit=cover')
  expect(source).not.toContain('user-scalable=no')
  expect(source).not.toContain('maximum-scale=1')
}

describe('product polish mobile release contracts', () => {
  it('keeps User and Hỗ trợ viewport metadata safe for Safari zoom and safe-area handling', () => {
    expectSafeMobileViewport(userHtml)
    expectSafeMobileViewport(adminHtml)
  })

  it('keeps one shared VisualViewport owner and the 16px composer input floor', () => {
    expect(userMainSource).toContain('setupViewportController()')
    expect(adminMainSource).toContain('setupViewportController()')
    expect(surfaceCss).toContain('.chat-composer__input')
    expect(surfaceCss).toContain('font-size:16px')
  })

  it('keeps foreground conversation suppression and scoped notification navigation in their owners', () => {
    expect(windowContextSource).toContain('CHAT_NOTIFICATION_CONTEXT_QUERY')
    expect(windowContextSource).toContain("visibilityState === 'visible'")
    expect(windowContextSource).toContain('selectedConversationId === requestedConversationId')
    expect(navigationSource).toContain('conversation')
    expect(navigationSource).toContain('admin')
  })
})
