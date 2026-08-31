import type { CapabilitySnapshot } from '../compat/capabilities'

export interface NotificationSupport {
  canPush: boolean
  canBadge: boolean
  canUseMediaSession: boolean
}

export function deriveNotificationSupport(capabilities: CapabilitySnapshot): NotificationSupport {
  return {
    canPush: capabilities.serviceWorker && capabilities.notifications && capabilities.pushManager,
    canBadge: capabilities.appBadge,
    canUseMediaSession: capabilities.mediaSession,
  }
}
