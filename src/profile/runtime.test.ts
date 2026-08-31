import { describe, expect, it } from 'vitest'
import type { CustomerProfile, CustomerProfilePatch, ProfileBackend } from './contracts'
import { updateCustomerProfile } from './runtime'

function createBackend(result: CustomerProfile) {
  let lastPatch: CustomerProfilePatch | null = null
  const backend: ProfileBackend = {
    async updateMyProfile(patch) {
      lastPatch = patch
      return result
    },
  }
  return { backend, getLastPatch: () => lastPatch }
}

describe('updateCustomerProfile', () => {
  it('trims name/address and preserves returned profile id', async () => {
    const fake = createBackend({
      id: 'profile-1',
      display_name: 'Lan',
      username: null,
      avatar_url: null,
      address: 'Hà Nội',
      identity_type: 'anonymous',
    })

    const result = await updateCustomerProfile(fake.backend, {
      displayName: '  Lan  ',
      address: '  Hà Nội  ',
    })

    expect(result.id).toBe('profile-1')
    expect(fake.getLastPatch()).toEqual({ displayName: 'Lan', address: 'Hà Nội' })
  })

  it('normalizes empty strings to null', async () => {
    const fake = createBackend({
      id: 'profile-2',
      display_name: null,
      username: null,
      avatar_url: null,
      address: null,
      identity_type: 'anonymous',
    })

    await updateCustomerProfile(fake.backend, { displayName: '   ', address: '' })
    expect(fake.getLastPatch()).toEqual({ displayName: null, address: null })
  })
})
