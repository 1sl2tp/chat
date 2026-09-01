import { describe, expect, it, vi } from 'vitest'
import { prepareFixedTestRuntime } from './fixed-runtime'

describe('fixed test user call pairing wiring', () => {
  it('creates one temporary anonymous profile only to upgrade it into fixed User 2', async () => {
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
      signInAnonymously: vi.fn(async () => {
        events.push('signInAnonymously')
      }),
      upgradeCurrentUser: vi.fn(async () => {
        events.push('upgradeCurrentUser')
      }),
      refreshSession: vi.fn(async () => {
        events.push('refreshSession')
      }),
    }

    await prepareFixedTestRuntime(backend, async () => {
      events.push('startChatRuntime')
    })

    expect(events).toEqual([
      'getCurrentUser',
      'signIn',
      'signInAnonymously',
      'startChatRuntime',
      'upgradeCurrentUser',
      'refreshSession',
    ])
  })
})
