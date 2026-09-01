import { describe, expect, it, vi } from 'vitest'
import { prepareFixedTestRuntime } from './fixed-runtime'

describe('prepareFixedTestRuntime', () => {
  it('uses the fixed account directly when it already exists', async () => {
    const events: string[] = []
    const backend: any = {
      getCurrentUser: vi.fn(async () => ({ email: 'test@taphoa.chat', isAnonymous: false })),
      signOut: vi.fn(async () => { events.push('sign-out') }),
      signIn: vi.fn(async () => { events.push('sign-in-fixed') }),
      signUp: vi.fn(async () => false),
      signInAnonymously: vi.fn(async () => { events.push('sign-in-anon') }),
      upgradeCurrentUser: vi.fn(async () => { events.push('upgrade') }),
      refreshSession: vi.fn(async () => { events.push('refresh') }),
    }

    await prepareFixedTestRuntime(backend, async () => { events.push('bootstrap') })

    expect(events).toEqual(['bootstrap'])
  })

  it('seeds the fixed account from one anonymous bootstrap when fixed login is missing', async () => {
    const events: string[] = []
    let current: { email: string | null; isAnonymous: boolean } | null = null
    const backend: any = {
      getCurrentUser: vi.fn(async () => current),
      signOut: vi.fn(async () => { current = null; events.push('sign-out') }),
      signIn: vi.fn(async () => {
        events.push('sign-in-fixed')
        throw new Error('invalid_credentials')
      }),
      signUp: vi.fn(async () => { throw new Error('public signup must not be used') }),
      signInAnonymously: vi.fn(async () => {
        current = { email: null, isAnonymous: true }
        events.push('sign-in-anon')
      }),
      upgradeCurrentUser: vi.fn(async () => { events.push('upgrade') }),
      refreshSession: vi.fn(async () => { events.push('refresh') }),
    }

    await prepareFixedTestRuntime(backend, async () => { events.push('bootstrap') })

    expect(events).toEqual([
      'sign-in-fixed',
      'sign-in-anon',
      'bootstrap',
      'upgrade',
      'refresh',
    ])
  })
})
