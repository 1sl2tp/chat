import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const required = [
  'vendor/chatwoot-mobile-ui/LICENSE',
  'vendor/chatwoot-mobile-ui/UPSTREAM.json',
  'vendor/chatwoot-mobile-ui/src/screens/auth/LoginScreen.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/ChatScreen.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/components/message-list/MessagesList.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/components/message-item/Message.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/chat-screen/components/reply-box/ReplyBoxContainer.tsx',
  'vendor/chatwoot-mobile-ui/src/screens/conversations/ConversationScreen.tsx',
  'vendor/chatwoot-web-ui/LICENSE',
  'vendor/chatwoot-web-ui/UPSTREAM.json',
  'vendor/chatwoot-web-ui/app/javascript/dashboard/components-next/call/CallCard.vue',
  'vendor/chatwoot-web-ui/app/javascript/dashboard/components/widgets/conversation/ConversationCallButton.vue',
  'vendor/chatwoot-web-ui/app/javascript/dashboard/components/widgets/conversation/VoiceCallStatus.vue',
  'vendor/chatwoot-web-ui/app/javascript/dashboard/components/widgets/VideoCallButton.vue',
]

describe('Chatwoot vendor mirror', () => {
  it('contains license, provenance and canonical UI owners', () => {
    for (const path of required) expect(fs.existsSync(path), path).toBe(true)
  })

  it('is never imported by production src', () => {
    const files = fs
      .readdirSync('src', { recursive: true })
      .filter(
        path =>
          typeof path === 'string' &&
          /\.(ts|css)$/.test(path) &&
          !/\.test\.ts$/.test(path),
      ) as string[]
    const offender = files.find(path => {
      const text = fs.readFileSync(`src/${path}`, 'utf8')
      return text.includes('vendor/chatwoot-mobile-ui') || text.includes('vendor/chatwoot-web-ui')
    })
    expect(offender).toBeUndefined()
  })
})
