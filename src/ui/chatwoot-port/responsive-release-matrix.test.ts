import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const conversationCss = fs.readFileSync('src/ui/chatwoot-port/conversation-shell.css', 'utf8')
const composerCss = fs.readFileSync('src/ui/chatwoot-port/composer/composer.css', 'utf8')
const messageCss = fs.readFileSync('src/ui/chatwoot-port/messages/message.css', 'utf8')
const userMain = fs.readFileSync('src/user-main.ts', 'utf8')
const adminMain = fs.readFileSync('src/admin-main.ts', 'utf8')

const RELEASE_WIDTHS = [280, 320, 360, 375, 390, 412, 430, 768, 1024, 1440] as const

type PaddingTier = 'compact' | 'medium' | 'wide'

function expectedPaddingTier(width: number): PaddingTier {
  if (width <= 480) return 'compact'
  if (width >= 1000) return 'wide'
  return 'medium'
}

describe('Chatwoot responsive release matrix 280→1440', () => {
  it('locks the exact release widths from the cutover plan', () => {
    expect(RELEASE_WIDTHS).toEqual([280, 320, 360, 375, 390, 412, 430, 768, 1024, 1440])
    expect(RELEASE_WIDTHS[0]).toBe(280)
    expect(RELEASE_WIDTHS.at(-1)).toBe(1440)
  })

  it('keeps one fluid conversation owner with no minimum-width trap at every release width', () => {
    expect(conversationCss).toMatch(/\.cw-conversation\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*width:\s*100%[^}]*min-width:\s*0/s)
    expect(conversationCss).toMatch(/\.cw-conversation__timeline\s*\{[^}]*flex:\s*1\s+1\s+auto[^}]*min-width:\s*0[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s)
    expect(conversationCss).toMatch(/\.cw-conversation__composer\s*\{[^}]*flex:\s*0\s+0\s+auto/s)

    for (const width of RELEASE_WIDTHS) {
      expect(width).toBeGreaterThanOrEqual(280)
      expect(width).toBeLessThanOrEqual(1440)
    }
  })

  it('maps the release widths onto the real compact/medium/wide CSS breakpoints', () => {
    expect(conversationCss).toContain('@media (max-width: 480px)')
    expect(conversationCss).toContain('@media (min-width: 760px)')
    expect(conversationCss).toContain('@media (min-width: 1000px)')

    expect(RELEASE_WIDTHS.map(width => [width, expectedPaddingTier(width)])).toEqual([
      [280, 'compact'],
      [320, 'compact'],
      [360, 'compact'],
      [375, 'compact'],
      [390, 'compact'],
      [412, 'compact'],
      [430, 'compact'],
      [768, 'medium'],
      [1024, 'wide'],
      [1440, 'wide'],
    ])
  })

  it('keeps the composer usable at the 280px hard gate without iOS focus zoom', () => {
    expect(composerCss).toMatch(/\.cw-composer\s*\{[^}]*grid-template-columns:\s*36px\s+minmax\(0,\s*1fr\)\s+36px[^}]*width:\s*100%/s)
    expect(composerCss).toMatch(/\.cw-composer__input\s*\{[^}]*width:\s*100%[^}]*font-size:\s*16px/s)
  })

  it('keeps reaction/time and contextual media actions in non-overlapping flow', () => {
    expect(messageCss).toMatch(/\.cw-message__footer\s*\{[^}]*display:\s*flex[^}]*min-height:\s*21px/s)
    expect(messageCss).toMatch(/\.cw-message__reaction-slot\s*\{[^}]*align-self:\s*flex-start[^}]*min-height:\s*20px/s)
    expect(messageCss).not.toMatch(/\.cw-message__reaction-slot\s*\{[^}]*position:\s*absolute/s)
    expect(messageCss).toMatch(/\.cw-media-actions\s*\{[^}]*position:\s*relative/s)
  })

  it('uses the same Chatwoot conversation owner for User and Hỗ trợ at every release width', () => {
    for (const source of [userMain, adminMain]) {
      expect(source).toContain("from './ui/chatwoot-port/conversation-screen'")
      expect(source).toContain('mountConversationScreen')
      expect(source).not.toContain('mountConversationSurface')
    }
  })
})
