import { describe, expect, it } from 'vitest'
import { deriveNetworkPhase } from './state'

describe('network lifecycle', () => {
  it('distinguishes browser connectivity from backend reachability', () => {
    expect(deriveNetworkPhase({ browserOnline: false, backendReachable: null, reconnecting: false })).toBe('offline')
    expect(deriveNetworkPhase({ browserOnline: true, backendReachable: false, reconnecting: false })).toBe('backend-unreachable')
    expect(deriveNetworkPhase({ browserOnline: true, backendReachable: true, reconnecting: true })).toBe('reconnecting')
    expect(deriveNetworkPhase({ browserOnline: true, backendReachable: true, reconnecting: false })).toBe('online')
  })
})
