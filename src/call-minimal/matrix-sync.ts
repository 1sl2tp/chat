import { MATRIX_PROFILES, type MatrixProfileId } from './matrix-profiles'

export const MATRIX_PROFILE_SYNC_TOPIC = 'taphoa.v15.matrix.profile-ready'

export interface MatrixProfileReadyMessage {
  type: 'matrix-profile-ready'
  profile: MatrixProfileId
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const PROFILE_IDS = new Set<string>(MATRIX_PROFILES.map((profile) => profile.id))

export function encodeProfileReady(profile: MatrixProfileId): Uint8Array {
  return encoder.encode(JSON.stringify({ type: 'matrix-profile-ready', profile } satisfies MatrixProfileReadyMessage))
}

export function decodeProfileReady(payload: Uint8Array): MatrixProfileReadyMessage | null {
  try {
    const value: unknown = JSON.parse(decoder.decode(payload))
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    if (record.type !== 'matrix-profile-ready') return null
    if (typeof record.profile !== 'string' || !PROFILE_IDS.has(record.profile)) return null
    return { type: 'matrix-profile-ready', profile: record.profile as MatrixProfileId }
  } catch {
    return null
  }
}

export function peerReadyForProfile(
  connectedPeerIds: Iterable<string>,
  reportedProfiles: ReadonlyMap<string, string>,
  profile: MatrixProfileId,
): boolean {
  for (const peerId of connectedPeerIds) {
    if (reportedProfiles.get(peerId) === profile) return true
  }
  return false
}
