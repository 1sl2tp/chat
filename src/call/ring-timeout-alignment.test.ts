import { describe, expect, it } from 'vitest'
import sender from '../../supabase/functions/taphoaxyz-call-push/index.ts?raw'
import migration from '../../supabase/migrations/20260902_call_ring_timeout_60.sql?raw'

describe('incoming call delivery window', () => {
  it('keeps the server ringing window aligned with the 60-second Push TTL', () => {
    expect(sender).toContain('{ ttl: 60, urgency: "high" }')
    expect(migration).toContain('ring_timeout_seconds = 60')
  })
})
