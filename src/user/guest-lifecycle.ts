import { GUEST_DEVICE_KEY_STORAGE } from '../device/identity'
import { GUEST_AUTH_STORAGE_KEY } from '../supabase/client'

type RemovableStorage = Pick<Storage, 'removeItem'>

export function clearGuestLocalState(storage: RemovableStorage = sessionStorage): void {
  storage.removeItem(GUEST_AUTH_STORAGE_KEY)
  storage.removeItem(GUEST_DEVICE_KEY_STORAGE)
}
