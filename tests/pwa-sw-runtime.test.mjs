import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SW_SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function bootServiceWorker({ clients = [] } = {}) {
  const handlers = new Map();
  const notifications = [];
  const opened = [];
  const self = {
    registration: {
      scope: 'https://example.test/chat/',
      async showNotification(title, options) {
        notifications.push({ title, options });
      }
    },
    clients: {
      async claim() {},
      async matchAll() { return clients; },
      async openWindow(url) { opened.push(url); return { url }; }
    },
    skipWaiting() {},
    addEventListener(type, handler) { handlers.set(type, handler); }
  };
  vm.runInNewContext(SW_SOURCE, { self, URL, console }, { filename: 'sw.js' });
  return { handlers, notifications, opened };
}

function pushEvent(payload) {
  let pending = Promise.resolve();
  return {
    data: { json: () => payload, text: () => JSON.stringify(payload) },
    waitUntil(value) { pending = Promise.resolve(value); },
    done: () => pending
  };
}

function clickEvent(data) {
  let pending = Promise.resolve();
  let closed = false;
  return {
    notification: { data, close() { closed = true; } },
    waitUntil(value) { pending = Promise.resolve(value); },
    done: () => pending,
    closed: () => closed
  };
}

test('service worker runtime shows incoming-call notification from canonical ids and ignores legacy navigate', async () => {
  const sw = bootServiceWorker();
  const event = pushEvent({
    type: 'incoming_call',
    title: 'Cuộc gọi TAPHOA',
    body: 'Hương đang gọi cho bạn',
    conversation_id: 'conv-123',
    call_id: 'call-456',
    navigate: './admin/?conversation=legacy'
  });
  sw.handlers.get('push')(event);
  await event.done();

  assert.equal(sw.notifications.length, 1);
  const shown = sw.notifications[0];
  assert.equal(shown.title, 'Cuộc gọi TAPHOA');
  assert.equal(shown.options.body, 'Hương đang gọi cho bạn');
  assert.equal(shown.options.tag, 'call-call-456');
  assert.equal(shown.options.requireInteraction, true);
  assert.equal(shown.options.renotify, true);
  assert.deepEqual(JSON.parse(JSON.stringify(shown.options.data)), {
    type: 'incoming_call',
    conversation_id: 'conv-123',
    call_id: 'call-456'
  });
  assert.equal('navigate' in shown.options.data, false);
});

test('notification click opens the V3 app root with canonical conversation/call query', async () => {
  const sw = bootServiceWorker();
  const event = clickEvent({ type: 'incoming_call', conversation_id: 'conv-123', call_id: 'call-456' });
  sw.handlers.get('notificationclick')(event);
  await event.done();

  assert.equal(event.closed(), true);
  assert.deepEqual(sw.opened, [
    'https://example.test/chat/?conversation=conv-123&call=call-456&notification=incoming_call'
  ]);
});

test('notification click reuses an existing app window without reload, posts payload and focuses it', async () => {
  const actions = [];
  const client = {
    url: 'https://example.test/chat/',
    postMessage(message) { actions.push(['message', message]); },
    async focus() { actions.push(['focus']); return this; }
  };
  const sw = bootServiceWorker({ clients: [client] });
  const event = clickEvent({ type: 'chat_message', conversation_id: 'conv-a', call_id: null });
  sw.handlers.get('notificationclick')(event);
  await event.done();

  assert.deepEqual(JSON.parse(JSON.stringify(actions)), [
    ['message', { type: 'taphoa:notification-click', payload: { type: 'chat_message', conversation_id: 'conv-a', call_id: null } }],
    ['focus']
  ]);
  assert.deepEqual(sw.opened, []);
});
