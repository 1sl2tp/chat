export type AppIdentityKind = 'guest_customer' | 'registered_customer' | 'admin'

export interface ResolvedIdentity {
  kind: AppIdentityKind
  profileId: string | null
  authUserId: string
  isAdmin: boolean
}

export interface IdentityBackend {
  resolveCurrentIdentity(): Promise<ResolvedIdentity>
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(code)
  return value
}

export function decodeResolvedIdentity(value: unknown): ResolvedIdentity {
  if (!value || typeof value !== 'object') throw new Error('invalid_identity_payload')
  const row = value as Record<string, unknown>
  const kind = row.kind
  if (kind !== 'guest_customer' && kind !== 'registered_customer' && kind !== 'admin') {
    throw new Error('invalid_identity_kind')
  }
  const profileId = row.profile_id
  if (profileId !== null && typeof profileId !== 'string') throw new Error('invalid_identity_profile')
  if (typeof row.is_admin !== 'boolean') throw new Error('invalid_identity_admin_flag')

  return {
    kind,
    profileId,
    authUserId: requiredString(row.auth_user_id, 'invalid_identity_auth_user'),
    isAdmin: row.is_admin,
  }
}
