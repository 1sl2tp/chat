import { describe, expect, it, vi } from 'vitest'
import { ensureFixedTestUser, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './fixed-auth'

describe('ensureFixedTestUser', () => {
  it('keeps the existing test user session', async () => {
    const backend = {
      getCurrentUser: vi.fn(async () => ({ email: TEST_USER_EMAIL, isAnonymous: false })),
      signOut: vi.fn(async () => undefined),
      signIn: vi.fn(async () => undefined),
      signUp: vi.fn(async () => true),
    }

    await ensureFixedTestUser(backend)

    expect(backend.signOut).not.toHaveBeenCalled()
    expect(backend.signIn).not.toHaveBeenCalled()
    expect(backend.signUp).not.toHaveBeenCalled()
  })

  it('replaces another session and signs in the fixed test user', async () => {
    const backend = {
      getCurrentUser: vi.fn(async () => ({ email: null, isAnonymous: true })),
      signOut: vi.fn(async () => undefined),
      signIn: vi.fn(async () => undefined),
      signUp: vi.fn(async () => true),
    }

    await ensureFixedTestUser(backend)

    expect(backend.signOut).toHaveBeenCalledTimes(1)
    expect(backend.signIn).toHaveBeenCalledWith(TEST_USER_EMAIL, TEST_USER_PASSWORD)
    expect(backend.signUp).not.toHaveBeenCalled()
  })

  it('creates the fixed test user when first sign-in says it does not exist', async () => {
    const backend = {
      getCurrentUser: vi.fn(async () => null),
      signOut: vi.fn(async () => undefined),
      signIn: vi.fn()
        .mockRejectedValueOnce(new Error('invalid_credentials'))
        .mockResolvedValueOnce(undefined),
      signUp: vi.fn(async () => false),
    }

    await ensureFixedTestUser(backend)

    expect(backend.signUp).toHaveBeenCalledWith(TEST_USER_EMAIL, TEST_USER_PASSWORD)
    expect(backend.signIn).toHaveBeenCalledTimes(2)
  })
})
