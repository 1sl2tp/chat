import { describe, expect, it } from 'vitest'
import messageBackend from '../supabase/message-backend.ts?raw'
import voiceSession from '../call/voice-session.ts?raw'

describe('server-owned push client boundary', () => {
  it('does not dispatch Chat push from sender code', () => {
    expect(messageBackend).not.toContain('sendChatMessagePush')
    expect(messageBackend).not.toContain("action: 'send_message'")
  })

  it('does not dispatch Call push from caller code', () => {
    expect(voiceSession).not.toContain('sendIncomingCallPush')
    expect(voiceSession).not.toContain("action: 'send'")
  })
})
