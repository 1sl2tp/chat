import { describe, expect, it, vi } from 'vitest'
import { bootstrapChat, type ChatBootstrapBackend } from './bootstrap'

function createBackend(hasSession: boolean): ChatBootstrapBackend {
  return {
    hasSession: vi.fn().mockResolvedValue(hasSession),
    signInAnonymously: vi.fn().mockResolvedValue(undefined),
    bootstrapIdentity: vi.fn().mockResolvedValue({ profile_id: 'profile-1' }),
    getSupportEntry: vi.fn().mockResolvedValue({ conversation_id: 'conversation-1' }),
  }
}

describe('bootstrapChat', () => {
  it('creates an anonymous auth session once before bootstrapping a new guest', async () => {
    const backend = createBackend(false)

    const result = await bootstrapChat(backend, {
      deviceKey: 'device-1',
      label: 'PWA',
      platform: 'iPhone',
    })

    expect(backend.signInAnonymously).toHaveBeenCalledTimes(1)
    expect(backend.bootstrapIdentity).toHaveBeenCalledWith({
      deviceKey: 'device-1',
      label: 'PWA',
      platform: 'iPhone',
    })
    expect(backend.getSupportEntry).toHaveBeenCalledTimes(1)
    expect(result.createdAnonymousSession).toBe(true)
  })

  it('reuses an existing session without creating a second guest', async () => {
    const backend = createBackend(true)

    const result = await bootstrapChat(backend, {
      deviceKey: 'device-1',
      label: 'Web',
      platform: 'Android',
    })

    expect(backend.signInAnonymously).not.toHaveBeenCalled()
    expect(backend.bootstrapIdentity).toHaveBeenCalledTimes(1)
    expect(result.createdAnonymousSession).toBe(false)
  })
})
