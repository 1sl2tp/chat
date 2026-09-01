import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/20260902_decline_call_all_devices.sql?raw'

describe('decline incoming call', () => {
  it('ends the whole incoming call when any valid callee device declines', () => {
    expect(migration).toContain("set state='declined', responded_at=now()")
    expect(migration).toContain("where call_id=p_call_id and state='ringing'")
    expect(migration).toContain("set state='declined',ended_at=now(),end_reason='declined'")
    expect(migration).not.toContain('v_remaining')
  })
})
