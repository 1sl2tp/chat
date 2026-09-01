export function matchesVisibleConversation(
  selectedConversationId: string | null,
  requestedConversationId: string,
  visibilityState: DocumentVisibilityState,
): boolean {
  return visibilityState === 'visible'
    && Boolean(selectedConversationId)
    && selectedConversationId === requestedConversationId
}

export function installNotificationContextResponder(
  getSelectedConversationId: () => string | null,
): () => void {
  const serviceWorker = navigator.serviceWorker
  if (!serviceWorker) return () => undefined

  const listener = (event: MessageEvent): void => {
    const data = event.data as { type?: unknown; conversationId?: unknown } | null
    if (data?.type !== 'CHAT_NOTIFICATION_CONTEXT_QUERY') return
    if (typeof data.conversationId !== 'string') return
    const port = event.ports[0]
    if (!port) return

    port.postMessage({
      matches: matchesVisibleConversation(
        getSelectedConversationId(),
        data.conversationId,
        document.visibilityState,
      ),
    })
  }

  serviceWorker.addEventListener('message', listener)
  return () => serviceWorker.removeEventListener('message', listener)
}
