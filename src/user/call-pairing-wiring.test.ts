import { describe, expect, it, vi } from 'vitest'
import { prepareFixedTestRuntime } from './fixed-runtime'

describe('fixed test user call pairing wiring', () => {
  it('authenticates the fixed test user before chat bootstrap', async () => {
    const events: string[] = []
    const backend = {
      getCurrentUser: vi.fn(async () => {
        events.push('getCurrentUser')
        return null
      }),
      signOut: vi.fn(async () => {
        events.push('signOut')
      }),
      signIn: vi.fn(async () => {
        events.push('signIn')
        throw new Error('invalid_credentials')
      }),
      signUp: vi.fn(async () => {
        events.push('signUp')
        return true
      }),
    }

    await prepareFixedTestRuntime(backend, async () => {
      events.push('startChatRuntime')
    })

    expect(events.at(-1)).toBe('startChatRuntime')
    expect(events.indexOf('signUp')).toBeLessThan(events.indexOf('startChatRuntime'))
  })
})
