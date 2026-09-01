import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/20260902_call_target_reachability.sql?raw'

describe('voice call target reachability', () => {
  it('keeps recent foreground sessions as call targets', () => {
    expect(sql).toContain("d.last_seen_at >= now() - interval '5 minutes'")
    expect(sql).toContain("s.last_seen_at >= now() - interval '5 minutes'")
  })

  it('also keeps devices with a valid Push-bound auth session', () => {
    expect(sql).toContain('chat_service_push_targets')
    expect(sql).toContain('union')
    expect(sql).toContain('on conflict(call_id, device_id) do nothing')
  })

  it('does not require every call target to be recently seen', () => {
    expect(sql).not.toContain("and d.last_seen_at >= now() - interval '5 minutes'\n    and s.last_seen_at >= now() - interval '5 minutes'\n  on conflict")
  })
})
