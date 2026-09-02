import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import userMainSource from '../../user-main.ts?raw'
import adminMainSource from '../../admin-main.ts?raw'
import composerSource from '../../ui/chatwoot-port/composer/composer.ts?raw'

const conversationCssSource = readFileSync(new URL('../../ui/chatwoot-port/conversation-shell.css', import.meta.url), 'utf8')
const composerCssSource = readFileSync(new URL('../../ui/chatwoot-port/composer/composer.css', import.meta.url), 'utf8')

describe('shared User/Hỗ trợ Chatwoot Conversation wiring', () => {
  it('owns Conversation and ReplyBox behavior in shared Chatwoot components', () => {
    expect(userMainSource).toContain("from './ui/chatwoot-port/conversation-screen'")
    expect(adminMainSource).toContain("from './ui/chatwoot-port/conversation-screen'")
    expect(userMainSource).toContain('mountConversationScreen')
    expect(adminMainSource).toContain('mountConversationScreen')
    expect(composerSource).toContain("textarea.addEventListener('focus'")
    expect(composerSource).toContain('options.onFocus?.()')
  })

  it('installs the same viewport owner for User and Hỗ trợ', () => {
    expect(userMainSource).toContain('setupViewportController()')
    expect(adminMainSource).toContain('setupViewportController()')
  })

  it('lets the app hosts own visual viewport height while Conversation fills its host', () => {
    expect(conversationCssSource).toContain('height: 100%')
    expect(conversationCssSource).not.toContain('height: var(--app-visual-height, 100dvh)')
    expect(conversationCssSource).toContain('grid-template-rows: auto minmax(0, 1fr) auto')
    expect(composerCssSource).toContain('.cw-composer__input')
    expect(composerCssSource).toContain('font-size: 16px')
  })
})
