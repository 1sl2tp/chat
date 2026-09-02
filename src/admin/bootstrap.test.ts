import { describe, expect, it } from 'vitest'
import { bootstrapAdminIdentity, clearBootstrappedAdminIdentity, getBootstrappedAdminProfileId, startAdminWorkspace } from './bootstrap'

describe('admin identity bootstrap', () => {
  it('bootstraps the existing authenticated session before admin data loads', async () => {
    clearBootstrappedAdminIdentity()
    const calls: string[] = []
    const result = await bootstrapAdminIdentity({
      async hasSession() {
        calls.push('session')
        return true
      },
      async bootstrapIdentity(input) {
        calls.push(`bootstrap:${input.deviceKey}`)
        return { profile: { id: 'admin-profile' } }
      },
    }, {
      deviceKey: 'device-1',
      label: 'Web',
      platform: 'macOS',
    })

    expect(calls).toEqual(['session', 'bootstrap:device-1'])
    expect(result).toEqual({ profile: { id: 'admin-profile' } })
    expect(getBootstrappedAdminProfileId()).toBe('admin-profile')
  })

  it('clears retained admin identity explicitly', async () => {
    await bootstrapAdminIdentity({
      async hasSession() { return true },
      async bootstrapIdentity() { return { profile: { id: 'admin-profile' } } },
    }, { deviceKey: 'device-1', label: 'Web', platform: 'macOS' })
    clearBootstrappedAdminIdentity()
    expect(getBootstrappedAdminProfileId()).toBe('')
  })

  it('rejects missing admin auth session without creating an anonymous session', async () => {
    let bootstrapCalls = 0
    await expect(bootstrapAdminIdentity({
      async hasSession() { return false },
      async bootstrapIdentity() {
        bootstrapCalls += 1
        return null
      },
    }, {
      deviceKey: 'device-1',
      label: 'Web',
      platform: 'macOS',
    })).rejects.toThrow('admin_session_required')

    expect(bootstrapCalls).toBe(0)
  })

  it('starts admin inbox only after identity bootstrap succeeds', async () => {
    const calls: string[] = []
    await startAdminWorkspace({
      bootstrap: async () => { calls.push('bootstrap') },
      startAdmin: async () => { calls.push('inbox') },
      onError: () => { calls.push('error') },
    })
    expect(calls).toEqual(['bootstrap', 'inbox'])
  })

  it('does not load admin inbox when bootstrap fails', async () => {
    const calls: string[] = []
    await startAdminWorkspace({
      bootstrap: async () => {
        calls.push('bootstrap')
        throw new Error('admin_session_required')
      },
      startAdmin: async () => { calls.push('inbox') },
      onError: (error) => { calls.push(error.message) },
    })
    expect(calls).toEqual(['bootstrap', 'admin_session_required'])
  })
})
