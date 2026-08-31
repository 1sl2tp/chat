import type { SupabaseClient } from '@supabase/supabase-js'

function normalizeUrls(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => /^(stun|turn|turns):/i.test(item))
}

export function normalizeCallIceServers(payload: unknown): RTCIceServer[] {
  const rows = payload && typeof payload === 'object'
    ? (payload as { iceServers?: unknown }).iceServers
    : null

  if (!Array.isArray(rows)) return []

  return rows.flatMap((row): RTCIceServer[] => {
    if (!row || typeof row !== 'object') return []
    const source = row as { urls?: unknown; username?: unknown; credential?: unknown }
    const urls = normalizeUrls(source.urls)
    if (urls.length === 0) return []

    return [{
      urls,
      ...(typeof source.username === 'string' ? { username: source.username } : {}),
      ...(typeof source.credential === 'string' ? { credential: source.credential } : {}),
    }]
  })
}

export function hasTurnRelay(iceServers: readonly RTCIceServer[]): boolean {
  return iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
    return urls.some((url) => /^turns?:/i.test(url))
  })
}

export async function fetchCallIceServers(client: SupabaseClient): Promise<RTCIceServer[]> {
  const result = await client.functions.invoke('taphoaxyz-turn-credentials', { method: 'POST' })
  if (result.error) throw new Error(`turn_credentials_failed:${result.error.message}`)

  const iceServers = normalizeCallIceServers(result.data)
  if (iceServers.length === 0) throw new Error('turn_credentials_empty')
  if (!hasTurnRelay(iceServers)) throw new Error('turn_credentials_missing_turn')
  return iceServers
}
