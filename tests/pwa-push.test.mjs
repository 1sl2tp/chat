import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TaphoaPushService, urlBase64ToUint8Array } from '../.local-build/services/pwa/push-service.js';
import { notificationCallId, notificationConversationId } from '../.local-build/runtime/push-navigation.js';

function fixture({ permission = 'default', existing = null } = {}) {
  const calls = [];
  let currentPermission = permission;
  let subscription = existing;
  const browser = {
    supported: true,
    get permission() { return currentPermission; },
    async requestPermission() { calls.push(['permission']); currentPermission = 'granted'; return currentPermission; },
    async register(path) {
      calls.push(['register', path]);
      return {
        pushManager: {
          async getSubscription() { return subscription; },
          async subscribe(options) {
            calls.push(['subscribe', options.userVisibleOnly, options.applicationServerKey instanceof Uint8Array]);
            subscription = {
              endpoint: 'https://push.example/sub',
              toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p256', auth: 'auth' } }; },
              async unsubscribe() { calls.push(['unsubscribe']); return true; }
            };
            return subscription;
          }
        }
      };
    }
  };
  const port = {
    auth: {},
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (name === 'chat_upsert_call_push_subscription') return { data: true, error: null };
      if (name === 'chat_delete_call_push_subscription') return { data: true, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
    functions: {
      async invoke(name, body) {
        calls.push(['function', name, body]);
        return { data: { public_key: 'BEl6q3EES2fKpY5f6lT9QfYJ9HhFb-BuOe6z8v9aM0k' }, error: null };
      }
    }
  };
  return { browser, port, calls };
}

test('push start registers worker but never prompts without a user gesture', async () => {
  const f = fixture({ permission: 'default' });
  const service = new TaphoaPushService(f.port, f.browser);
  const result = await service.start('dev-1');
  assert.equal(result, 'permission-required');
  assert.deepEqual(f.calls, [['register', './sw.js']]);
});

test('explicit enable requests permission, fetches VAPID config, subscribes and binds subscription to current device', async () => {
  const f = fixture({ permission: 'default' });
  const service = new TaphoaPushService(f.port, f.browser);
  const result = await service.enable('dev-1');
  assert.equal(result, 'subscribed');
  assert.deepEqual(f.calls[0], ['permission']);
  assert.deepEqual(f.calls[1], ['register', './sw.js']);
  assert.deepEqual(f.calls[2], ['function', 'taphoaxyz-call-push', { action: 'config' }]);
  assert.deepEqual(f.calls[3], ['subscribe', true, true]);
  assert.deepEqual(f.calls[4], ['rpc', 'chat_upsert_call_push_subscription', {
    p_device_id: 'dev-1', p_endpoint: 'https://push.example/sub', p_p256dh: 'p256', p_auth: 'auth'
  }]);
});

test('already granted permission syncs existing subscription without prompting or resubscribing', async () => {
  const existing = {
    endpoint: 'https://push.example/existing',
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'oldp', auth: 'olda' } }; },
    async unsubscribe() { return true; }
  };
  const f = fixture({ permission: 'granted', existing });
  const service = new TaphoaPushService(f.port, f.browser);
  assert.equal(await service.start('dev-2'), 'subscribed');
  assert.equal(f.calls.some((item) => item[0] === 'permission'), false);
  assert.equal(f.calls.some((item) => item[0] === 'subscribe'), false);
  assert.deepEqual(f.calls.at(-1), ['rpc', 'chat_upsert_call_push_subscription', {
    p_device_id: 'dev-2', p_endpoint: 'https://push.example/existing', p_p256dh: 'oldp', p_auth: 'olda'
  }]);
});

test('disable removes server binding and browser subscription for the exact device', async () => {
  const existing = {
    endpoint: 'https://push.example/existing',
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'oldp', auth: 'olda' } }; },
    async unsubscribe() { return true; }
  };
  const f = fixture({ permission: 'granted', existing });
  const service = new TaphoaPushService(f.port, f.browser);
  assert.equal(await service.disable('dev-3'), 'disabled');
  assert.deepEqual(f.calls, [
    ['register', './sw.js'],
    ['rpc', 'chat_delete_call_push_subscription', { p_device_id: 'dev-3' }]
  ]);
});

test('VAPID url-safe base64 is converted to binary applicationServerKey', () => {
  const key = urlBase64ToUint8Array('AQIDBA');
  assert.deepEqual([...key], [1, 2, 3, 4]);
});

test('notification navigation resolves only a runtime conversation binding', () => {
  const bindings = new Map([['peer-a', 'conv-a'], ['peer-b', 'conv-b']]);
  assert.equal(notificationConversationId({ conversation_id: 'conv-b' }), 'conv-b');
  assert.equal(notificationConversationId({ conversationId: 'conv-a' }), 'conv-a');
  assert.equal(notificationConversationId({ conversation_id: '../admin' }), null);
  assert.equal(notificationCallId({ call_id: 'call-123' }), 'call-123');
  assert.equal(notificationCallId({ call_id: '../call' }), null);
  assert.equal([...bindings].find(([, conversationId]) => conversationId === 'conv-b')?.[0], 'peer-b');
});

test('service worker shows visible notifications and builds root navigation from canonical ids instead of legacy payload navigate', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /addEventListener\(['"]push['"]/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /conversation_id/);
  assert.match(sw, /call_id/);
  assert.match(sw, /notificationclick/);
  assert.match(sw, /clients\.openWindow|openWindow/);
  assert.match(sw, /client\.postMessage/);
  assert.doesNotMatch(sw, /client\.navigate\(/);
  assert.doesNotMatch(sw, /payload\.navigate\s*\|\|/);
});

test('live service factory exposes PushService on the same authenticated Supabase port', () => {
  const source = readFileSync(new URL('../src/runtime/live-services.ts', import.meta.url), 'utf8');
  assert.match(source, /TaphoaPushService/);
  assert.match(source, /createBrowserPushRuntime/);
  assert.match(source, /push:/);
});

test('main silently syncs granted push on live session and exposes explicit notification enable action in both chat menus', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /livePushService/);
  assert.match(main, /livePushService\.start\(session\.deviceId\)/);
  assert.match(main, /data-notifications/);
  assert.match(main, /enablePushNotifications/);
  assert.match(main, /taphoa:notification-click/);
  assert.match(main, /notificationPayloadFromSearch/);
  assert.match(main, /notificationCallId/);
  assert.match(main, /if \(notificationCallId\(payload\) && liveCallService\) void liveCallService\.start\(\)/);
});
