export interface PushNotificationPayload {
  type: string | undefined
  title: string
  body: string
  navigate: string
  badge: number | undefined
  tag: string | undefined
  conversationId: string | undefined
}

export function parsePushPayload(input: unknown): PushNotificationPayload {
  if (!input || typeof input !== 'object') {
    return {
      type: undefined,
      title: 'Chat',
      body: '',
      navigate: './',
      badge: undefined,
      tag: undefined,
      conversationId: undefined,
    }
  }

  const value = input as Record<string, unknown>

  return {
    type: typeof value.type === 'string' && value.type.length > 0 ? value.type : undefined,
    title: typeof value.title === 'string' && value.title.length > 0 ? value.title : 'Chat',
    body: typeof value.body === 'string' ? value.body : '',
    navigate: typeof value.navigate === 'string' && value.navigate.length > 0 ? value.navigate : './',
    badge: typeof value.badge === 'number' && Number.isFinite(value.badge) && value.badge >= 0 ? value.badge : undefined,
    tag: typeof value.tag === 'string' && value.tag.length > 0 ? value.tag : undefined,
    conversationId: typeof value.conversation_id === 'string' && value.conversation_id.length > 0 ? value.conversation_id : undefined,
  }
}

export function shouldShowSystemNotification(type: string | undefined, hasVisibleWindow: boolean): boolean {
  return !(type === 'incoming_call' && hasVisibleWindow)
}

export function notificationVibration(type: string | undefined): number[] | undefined {
  return type === 'incoming_call' ? [350, 180, 350, 900] : undefined
}
