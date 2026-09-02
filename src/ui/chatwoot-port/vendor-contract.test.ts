import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const required = [
  'vendor/chatwoot-mobile-ui/LICENSE',
  'vendor/chatwoot-mobile-ui/UPSTREAM.json',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/ChatScreen.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/components/message-list/MessagesList.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/components/message-item/Message.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/components/reply-box/ReplyBoxContainer.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/conversations/ConversationScreen.tsx',
]

describe('Chatwoot vendor mirror', () => {
  it('contains license, provenance and canonical UI owners', () => {
    for (const path of required) expect(fs.existsSync(path), path).toBe(true)
  })

  it('is never imported by production src', () => {
    const files = fs
      .readdirSync('src', { recursive: true })
      .filter(path => typeof path === 'string' && /\.(ts|css)$/.test(path)) as string[]
    const offender = files.find(path =>
      fs.readFileSync(`src/${path}`, 'utf8').includes('vendor/chatwoot-mobile-ui'),
    )
    expect(offender).toBeUndefined()
  })
})
