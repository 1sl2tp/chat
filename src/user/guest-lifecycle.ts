import { GUEST_DEVICE_KEY_STORAGE } from '../device/identity'
import { GUEST_AUTH_STORAGE_KEY } from '../supabase/client'
import type { RootUserMode } from './root-session'

type RemovableStorage = Pick<Storage, 'removeItem'>

export function clearGuestLocalState(storage: RemovableStorage = sessionStorage): void {
  storage.removeItem(GUEST_AUTH_STORAGE_KEY)
  storage.removeItem(GUEST_DEVICE_KEY_STORAGE)
}

export function shouldClearGuestOnPageHide(mode: RootUserMode, persisted: boolean): boolean {
  return mode === 'guest' && !persisted
}

// This module is loaded only by the root User app. Removing guest-owned keys is
// safe even if User2 is active because User2/Admin use different namespaces.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) clearGuestLocalState()
  })
}
