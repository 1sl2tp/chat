export function matchesVisibleConversation(
  _selectedConversationId: string | null,
  _requestedConversationId: string,
  _visibilityState: DocumentVisibilityState,
): boolean {
  return false
}

export function installNotificationContextResponder(
  _getSelectedConversationId: () => string | null,
): () => void {
  return () => undefined
}
