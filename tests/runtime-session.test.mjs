import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminRuntimeSession, buildUserRuntimeSession } from '../.local-build/runtime/session-model.js';

const auth = {
  bootstrap: {
    profile: { id: 'p-user', display_name: 'Khách A', username: null, avatar_url: null },
    device_id: 'd1', auth_session_id: 's1', is_anonymous: true
  },
  identity: { kind: 'guest_customer', profile_id: 'p-user', auth_user_id: 'a1', is_admin: false },
  support: {
    conversation_id: 'conv-support', support_conversation: 'conv-support',
    admin_profile: { id: 'p-admin', display_name: 'Tùng', username: 'admin', avatar_url: null }
  }
};

test('user runtime binds the support peer profile to exactly one support conversation', () => {
  const session = buildUserRuntimeSession(auth);
  assert.equal(session.role, 'user');
  assert.equal(session.localProfileId, 'p-user');
  assert.equal(session.support.id, 'p-admin');
  assert.equal(session.support.name, 'Tùng');
  assert.equal(session.conversationIds.get('p-admin'), 'conv-support');
  assert.equal(session.contacts.length, 0);
});

test('admin runtime keeps profile ids as contacts and conversation ids outside Contact', () => {
  const session = buildAdminRuntimeSession({
    ...auth,
    identity: { kind: 'admin', profile_id: 'p-admin', auth_user_id: 'a-admin', is_admin: true },
    bootstrap: { ...auth.bootstrap, profile: { id: 'p-admin', display_name: 'Tùng', username: 'admin', avatar_url: null }, is_anonymous: false },
    support: { conversation_id: null, support_conversation: null, admin_profile: { id: 'p-admin', display_name: 'Tùng', username: 'admin' } }
  }, [
    { conversationId: 'c1', contact: { id: 'g1', name: 'Khách vãng lai', initials: 'KV', accountType: 'guest', customerGroupId: null, username: null, password: null, lastMessage: 'A', lastMessageAt: '2026-09-03T02:40:00Z', unread: 2 } },
    { conversationId: 'c2', contact: { id: 'u2', name: 'Khách hàng', initials: 'KH', accountType: 'customer', customerGroupId: null, username: 'kh1', password: null, lastMessage: 'B', lastMessageAt: '2026-09-03T02:41:00Z', unread: 0 } }
  ]);
  assert.equal(session.role, 'admin');
  assert.equal(session.localProfileId, 'p-admin');
  assert.deepEqual(session.contacts.map((c) => c.id), ['g1', 'u2']);
  assert.equal(session.conversationIds.get('g1'), 'c1');
  assert.equal(session.conversationIds.get('u2'), 'c2');
  assert.equal(session.support, null);
});

test('runtime session rejects missing support conversation instead of inventing one', () => {
  assert.throws(() => buildUserRuntimeSession({ ...auth, support: { ...auth.support, conversation_id: null, support_conversation: null } }), /support conversation/i);
});


test('live runtime keeps the authenticated Supabase device id for voice-call authorization', () => {
  const session = buildUserRuntimeSession(auth);
  assert.equal(session.deviceId, 'd1');
});
