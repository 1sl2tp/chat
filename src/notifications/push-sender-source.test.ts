import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('supabase/functions/taphoaxyz-call-push/index.ts', 'utf8')

describe('taphoaxyz-call-push source contract', () => {
  it('supports an end-to-end readiness probe targeted to the current device', () => {
    expect(source).toContain('action === "test"')
    expect(source).toContain('device_id')
    expect(source).toContain('Thông báo TAPHOA đã sẵn sàng')
  })

  it('supports chat message push without creating a second notification backend', () => {
    expect(source).toContain('action === "send_message"')
    expect(source).toContain('message_id')
    expect(source).toContain('chat_conversation_members')
    expect(source).toContain('Tin nhắn mới')
  })

  it('keeps incoming call push on the same sender', () => {
    expect(source).toContain('incoming_call')
    expect(source).toContain('call_id')
  })
})
