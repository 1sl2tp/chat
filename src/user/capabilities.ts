import type { RootUserMode } from './root-session'

export interface RootUserCapabilities {
  call: boolean
  push: boolean
}

export function capabilitiesForRootMode(mode: RootUserMode): RootUserCapabilities {
  return mode === 'user2'
    ? { call: true, push: true }
    : { call: false, push: false }
}
