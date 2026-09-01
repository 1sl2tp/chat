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
