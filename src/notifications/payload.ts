export interface PushNotificationPayload {
  title: string
  body: string
  navigate: string
  badge: number | undefined
  tag: string | undefined
}

export function parsePushPayload(input: unknown): PushNotificationPayload {
  if (!input || typeof input !== 'object') {
    return {
      title: 'Chat',
      body: '',
      navigate: './',
      badge: undefined,
      tag: undefined,
    }
  }

  const value = input as Record<string, unknown>

  return {
    title: typeof value.title === 'string' && value.title.length > 0 ? value.title : 'Chat',
    body: typeof value.body === 'string' ? value.body : '',
    navigate: typeof value.navigate === 'string' && value.navigate.length > 0 ? value.navigate : './',
    badge: typeof value.badge === 'number' && Number.isFinite(value.badge) && value.badge >= 0 ? value.badge : undefined,
    tag: typeof value.tag === 'string' && value.tag.length > 0 ? value.tag : undefined,
  }
}
