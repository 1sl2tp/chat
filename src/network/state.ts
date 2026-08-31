export type NetworkPhase = 'offline' | 'online' | 'degraded' | 'backend-unreachable' | 'reconnecting'

export interface NetworkProbe {
  browserOnline: boolean
  backendReachable: boolean | null
  reconnecting: boolean
}

export function deriveNetworkPhase(input: NetworkProbe): NetworkPhase {
  if (!input.browserOnline) return 'offline'
  if (input.reconnecting) return 'reconnecting'
  if (input.backendReachable === false) return 'backend-unreachable'
  if (input.backendReachable === null) return 'degraded'
  return 'online'
}
