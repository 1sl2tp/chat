import { describe, expect, it, vi } from 'vitest'
import { resolveRootMode } from './root-session'

describe('resolveRootMode', () => {
  it('starts User1 when there is no persistent User2 session', async () => {
    const clearUser2Session = vi.fn(async () => {})

    const mode = await resolveRootMode({
      getUser2Session: async () => null,
      clearUser2Session,
    })

    expect(mode).toBe('guest')
    expect(clearUser2Session).not.toHaveBeenCalled()
  })

  it('keeps a valid non-anonymous User2 session across reopen', async () => {
    const clearUser2Session = vi.fn(async () => {})

    const mode = await resolveRootMode({
      getUser2Session: async () => ({ isAnonymous: false }),
      clearUser2Session,
    })

    expect(mode).toBe('user2')
    expect(clearUser2Session).not.toHaveBeenCalled()
  })

  it('rejects stale anonymous state in the persistent User2 namespace', async () => {
    const clearUser2Session = vi.fn(async () => {})

    const mode = await resolveRootMode({
      getUser2Session: async () => ({ isAnonymous: true }),
      clearUser2Session,
    })

    expect(mode).toBe('guest')
    expect(clearUser2Session).toHaveBeenCalledTimes(1)
  })
})
