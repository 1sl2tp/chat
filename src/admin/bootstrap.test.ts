import { describe, expect, it } from 'vitest'
import { bootstrapAdminIdentity } from './bootstrap'

describe('admin identity bootstrap', () => {
  it('bootstraps the existing authenticated session before admin data loads', async () => {
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
})
