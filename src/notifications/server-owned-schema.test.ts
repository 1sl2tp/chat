import { describe, expect, it } from 'vitest'
import bindingSql from '../../supabase/migrations/20260901_push_session_binding_and_outbox.sql?raw'

describe('server-owned notification schema foundation', () => {
  it('binds subscriptions to exact auth sessions', () => {
    expect(bindingSql).toContain('auth_session_id uuid')
    expect(bindingSql).toContain('join auth.sessions')
    expect(bindingSql).toContain('a.user_id = p.auth_user_id')
    expect(bindingSql).toContain("a.not_after is null or a.not_after > now()")
  })

  it('rebinding a cached endpoint removes stale ownership', () => {
    expect(bindingSql).toContain('delete from public.chat_call_push_subscriptions')
    expect(bindingSql).toContain('endpoint = p_endpoint')
    expect(bindingSql).toContain('auth_session_id')
  })

  it('makes target validation service-only', () => {
    expect(bindingSql).toContain('create or replace function public.chat_service_push_targets')
    expect(bindingSql).toContain('revoke all on function public.chat_service_push_targets')
    expect(bindingSql).toContain('to service_role')
  })

  it('creates an outbox and pg_net dispatch helper', () => {
    expect(bindingSql).toContain('create table if not exists public.chat_notification_outbox')
    expect(bindingSql).toContain('unique(event_type, source_id, recipient_profile_id)')
    expect(bindingSql).toContain('dispatch_token uuid')
    expect(bindingSql).toContain('net.http_post')
    expect(bindingSql).toContain("'dispatch_event'")
  })
})
