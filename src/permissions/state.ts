export type AppPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable'

export function derivePermissionState(value: PermissionState | NotificationPermission | undefined): AppPermissionState {
  if (value === 'granted') return 'granted'
  if (value === 'denied') return 'denied'
  if (value === 'prompt' || value === 'default') return 'prompt'
  return 'unknown'
}

export function shouldRequestPermission(state: AppPermissionState, supported: boolean): boolean {
  return supported && state === 'prompt'
}
