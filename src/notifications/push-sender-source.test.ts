import { describe, expect, it } from 'vitest'
import source from '../../supabase/functions/taphoaxyz-call-push/index.ts?raw'

describe('taphoaxyz-call-push source contract', () => {
  it('supports an end-to-end readiness probe targeted to the current device', () => {
    expect(source).toContain('action === "test"')
    expect(source).toContain('device_id')
    expect(source).toContain('Thông báo TAPHOA đã sẵn sàng')
  })

  it('dispatches canonical server-owned notification events', () => {
    expect(source).toContain('dispatch_event')
    expect(source).toContain('chat_service_push_targets')
    expect(source).toContain('chat_notification_outbox')
    expect(source).toContain('dispatch_token')
    expect(source).toContain('processed_at')
    expect(source).toContain('message_id: message.id')
    expect(source).toContain('call_id: call.id')
  })

  it('keeps exact target validity in the service-only RPC', () => {
    const start = source.indexOf('async function sendToProfile')
    const end = source.indexOf('function messagePreview')
    const sendToProfileSource = source.slice(start, end)
    expect(sendToProfileSource).toContain('service.rpc("chat_service_push_targets"')
    expect(sendToProfileSource).not.toContain('.from("chat_devices")')
  })

  it('exposes only config, exact-device test, and internal dispatch in the final sender', () => {
    expect(source).not.toContain('action === "send_message"')
    expect(source).not.toContain('action !== "send"')
    expect(source).toContain('dispatch_event')
    expect(source).toContain('action === "config"')
    expect(source).toContain('action === "test"')
  })
})
