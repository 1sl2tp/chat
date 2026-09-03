import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveRuntimeBootstrap } from '../.local-build/runtime/live-runtime-bootstrap.js';

const userAuth = {
  bootstrap: { profile: { id: 'user1', display_name: 'Khách A', username: null, avatar_url: null }, device_id: 'd', auth_session_id: 's', is_anonymous: true },
  identity: { kind: 'guest_customer', profile_id: 'user1', auth_user_id: 'a', is_admin: false },
  support: { conversation_id: 'conv1', support_conversation: 'conv1', admin_profile: { id: 'admin1', display_name: 'Tùng', username: 'admin' } }
};
const adminAuth = {
  ...userAuth,
  bootstrap: { ...userAuth.bootstrap, profile: { id: 'admin1', display_name: 'Tùng', username: 'admin', avatar_url: null }, is_anonymous: false },
  identity: { kind: 'admin', profile_id: 'admin1', auth_user_id: 'aa', is_admin: true },
  support: { conversation_id: null, support_conversation: null, admin_profile: { id: 'admin1', display_name: 'Tùng', username: 'admin' } }
};

class FakeAuth {
  calls = [];
  restoreResult = null;
  async restore(device) { this.calls.push(['restore', device]); return this.restoreResult; }
  async bootstrap(options) { this.calls.push(['guest', options]); return userAuth; }
  async signInWithUsername(username, password, device) { this.calls.push(['login', username, password, device]); return username === 'admin' ? adminAuth : userAuth; }
}
class FakeChat {
  calls = [];
  async loadAdminDirectory() { this.calls.push(['directory']); return [{ conversationId: 'c2', contact: { id: 'u2', name: 'KH', initials: 'KH', accountType: 'customer', customerGroupId: null, username: 'kh', password: null, lastMessage: '', lastMessageAt: '2026-09-03T00:00:00Z', unread: 0 } }]; }
}

const device = { label: 'Safari', platform: 'ios', legacyGuestToken: null };

test('restore returns null when no Supabase session exists instead of silently creating guest', async () => {
  const auth = new FakeAuth();
  const chat = new FakeChat();
  const runtime = new LiveRuntimeBootstrap(auth, chat);
  assert.equal(await runtime.restore(device), null);
  assert.deepEqual(auth.calls, [['restore', device]]);
  assert.deepEqual(chat.calls, []);
});

test('guest choice creates anonymous identity and user support runtime', async () => {
  const auth = new FakeAuth();
  const chat = new FakeChat();
  const runtime = new LiveRuntimeBootstrap(auth, chat);
  const session = await runtime.continueAsGuest(device);
  assert.equal(session.role, 'user');
  assert.equal(session.support.id, 'admin1');
  assert.equal(session.conversationIds.get('admin1'), 'conv1');
  assert.deepEqual(chat.calls, []);
});

test('password login resolves identity and loads admin inbox only for admin', async () => {
  const auth = new FakeAuth();
  const chat = new FakeChat();
  const runtime = new LiveRuntimeBootstrap(auth, chat);
  const session = await runtime.login('admin', 'secret', device);
  assert.equal(session.role, 'admin');
  assert.equal(session.contacts[0].id, 'u2');
  assert.equal(session.conversationIds.get('u2'), 'c2');
  assert.deepEqual(chat.calls, [['directory']]);
});
