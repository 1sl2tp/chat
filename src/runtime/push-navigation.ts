export interface PushNavigationPayload {
  conversation_id?: unknown;
  conversationId?: unknown;
  call_id?: unknown;
  callId?: unknown;
  type?: unknown;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function notificationConversationId(payload: PushNavigationPayload): string | null {
  return safeId(payload.conversation_id ?? payload.conversationId);
}

export function notificationCallId(payload: PushNavigationPayload): string | null {
  return safeId(payload.call_id ?? payload.callId);
}

export function notificationPayloadFromSearch(search: string): PushNavigationPayload | null {
  const params = new URLSearchParams(search);
  const conversationId = safeId(params.get('conversation'));
  const callId = safeId(params.get('call'));
  const type = params.get('notification');
  if (!conversationId && !callId) return null;
  return { conversation_id: conversationId, call_id: callId, type };
}

function safeId(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return SAFE_ID.test(normalized) ? normalized : null;
}
