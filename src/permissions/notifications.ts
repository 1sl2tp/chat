import { derivePermissionState, shouldRequestPermission, type AppPermissionState } from './state'

export interface NotificationPermissionResult {
  before: AppPermissionState
  after: AppPermissionState
  requested: boolean
}

export async function requestNotificationPermissionOnce(notificationApi: typeof Notification | undefined): Promise<NotificationPermissionResult> {
  if (!notificationApi) {
    return { before: 'unavailable', after: 'unavailable', requested: false }
  }

  const before = derivePermissionState(notificationApi.permission)
  if (!shouldRequestPermission(before, true)) {
    return { before, after: before, requested: false }
  }

  const after = derivePermissionState(await notificationApi.requestPermission())
  return { before, after, requested: true }
}
