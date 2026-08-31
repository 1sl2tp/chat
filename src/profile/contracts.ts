export interface CustomerProfile {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  address: string | null
  identity_type: string
}

export interface CustomerProfilePatch {
  displayName: string | null
  address: string | null
}

export interface ProfileBackend {
  updateMyProfile(patch: CustomerProfilePatch): Promise<CustomerProfile>
}
