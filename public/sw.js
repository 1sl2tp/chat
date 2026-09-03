const APP_ICON = './icons/icon-192.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  const title = cleanText(payload.title) || (payload.type === 'incoming_call' ? 'Cuộc gọi TAPHOA' : 'TAPHOA');
  const body = cleanText(payload.body) || (payload.type === 'incoming_call' ? 'Bạn có cuộc gọi đến' : 'Bạn có tin nhắn mới');
  const data = canonicalData(payload);
  const incomingCall = payload.type === 'incoming_call';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: cleanText(payload.tag) || (incomingCall && data.call_id ? `call-${data.call_id}` : undefined),
    icon: APP_ICON,
    badge: APP_ICON,
    data,
    requireInteraction: incomingCall,
    renotify: incomingCall,
    vibrate: incomingCall ? [300, 120, 300, 120, 450] : [180]
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = canonicalData(event.notification.data || {});
  const target = notificationUrl(data);
  event.waitUntil(openOrFocus(target, data));
});

function readPayload(event) {
  if (!event.data) return {};
  try { return event.data.json() || {}; } catch (_) {
    try { return { body: event.data.text() }; } catch (_) { return {}; }
  }
}

function canonicalData(payload) {
  return {
    type: cleanText(payload.type),
    conversation_id: safeId(payload.conversation_id),
    call_id: safeId(payload.call_id)
  };
}

function notificationUrl(data) {
  const url = new URL('./', self.registration.scope);
  if (data.conversation_id) url.searchParams.set('conversation', data.conversation_id);
  if (data.call_id) url.searchParams.set('call', data.call_id);
  if (data.type) url.searchParams.set('notification', data.type);
  return url.href;
}

async function openOrFocus(target, data) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const client = windows.find((candidate) => candidate.url.startsWith(self.registration.scope));
  if (client) {
    client.postMessage({ type: 'taphoa:notification-click', payload: data });
    return client.focus();
  }
  return self.clients.openWindow(target);
}

function safeId(value) {
  const normalized = cleanText(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(normalized) ? normalized : null;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
