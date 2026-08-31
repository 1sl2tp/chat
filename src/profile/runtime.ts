import type { CustomerProfile, CustomerProfilePatch, ProfileBackend } from './contracts'

function normalize(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

export async function updateCustomerProfile(
  backend: ProfileBackend,
  patch: CustomerProfilePatch,
): Promise<CustomerProfile> {
  return backend.updateMyProfile({
    displayName: normalize(patch.displayName),
    address: normalize(patch.address),
  })
}
