import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseAuthService, usernameLoginEmail } from '../.local-build/services/supabase/auth-service.js';
import { SupabaseChatService } from '../.local-build/services/supabase/chat-service.js';

function ok(data) { return Promise.resolve({ data, error: null }); }

class FakePort {
  calls = [];
  session = null;
  auth = {
    getSession: async () => ({ data: { session: this.session }, error: null }),
    signInAnonymously: async () => { this.calls.push(['anon']); this.session = { user: { id: 'auth-guest', is_anonymous: true } }; return { data: { session: this.session }, error: null }; },
    signInWithPassword: async (input) => { this.calls.push(['password', input]); this.session = { user: { id: 'auth-user', is_anonymous: false } }; return { data: { session: this.session }, error: null }; },
    signOut: async () => ({ error: null })
  };
  async rpc(name, args = {}) {
    this.calls.push(['rpc', name, args]);
    if (name === 'chat_bootstrap_identity') return { data: { profile: { id: 'p1', display_name: 'Khách', username: null, avatar_url: null }, device_id: 'd1', auth_session_id: 's1', is_anonymous: true }, error: null };
    if (name === 'chat_resolve_identity') return { data: { kind: 'guest_customer', profile_id: 'p1', auth_user_id: 'auth-guest', is_admin: false }, error: null };
    if (name === 'chat_get_support_entry') return { data: { conversation_id: 'conv-support', support_conversation: 'conv-support', admin_profile: { id: 'admin', display_name: 'Admin' } }, error: null };
    if (name === 'chat_admin_support_inbox') return { data: [
      { conversation_id: 'c1', profile_id: 'g1', display_name: 'Khách vãng lai', username: null, user_level: 1, identity_type: 'guest', address: null, customer_last_seen_at: null, last_message_at: '2026-09-03T02:40:00Z', last_message_text: 'A', last_message_type: 'text', unread_count: 2 },
      { conversation_id: 'c2', profile_id: 'u2', display_name: 'Khách hàng', username: 'kh1', user_level: 2, identity_type: 'registered', address: null, customer_last_seen_at: null, last_message_at: '2026-09-03T02:41:00Z', last_message_text: 'B', last_message_type: 'text', unread_count: 0 }
    ], error: null };
    if (name === 'chat_send_text_message') return { data: { id: 'm1' }, error: null };
    if (name === 'chat_mark_conversation_read') return { data: null, error: null };
    throw new Error(`unexpected rpc ${name}`);
  }
  async select() { return { data: [], error: null }; }
  storage = {
    createSignedUrls: async () => ({ data: [], error: null }),
    upload: async () => ({ data: { path: 'p' }, error: null }),
    remove: async () => ({ data: [], error: null })
  };
  subscribeToConversation() { return () => undefined; }
}

test('username login is normalized to the existing @taphoa.chat auth convention', () => {
  assert.equal(usernameLoginEmail(' @Khach_01 '), 'khach_01@taphoa.chat');
});

test('auth bootstrap creates anonymous session only when needed and then resolves profile', async () => {
  const port = new FakePort();
  const service = new SupabaseAuthService(port, { loadDeviceKey: () => '11111111-1111-4111-8111-111111111111' });
  const result = await service.bootstrap({ allowAnonymous: true, label: 'Safari', platform: 'ios' });
  assert.equal(result.identity.profile_id, 'p1');
  assert.equal(result.support.conversation_id, 'conv-support');
  assert.equal(port.calls.filter((x) => x[0] === 'anon').length, 1);
  assert.ok(port.calls.some((x) => x[1] === 'chat_bootstrap_identity'));
  assert.ok(port.calls.some((x) => x[1] === 'chat_resolve_identity'));
});

test('registered login uses username convention without exposing email UI', async () => {
  const port = new FakePort();
  const service = new SupabaseAuthService(port, { loadDeviceKey: () => '11111111-1111-4111-8111-111111111111' });
  await service.signInWithUsername('Admin', 'secret', { label: 'Mac', platform: 'web' });
  const login = port.calls.find((x) => x[0] === 'password');
  assert.deepEqual(login[1], { email: 'admin@taphoa.chat', password: 'secret' });
});

test('admin inbox maps only guest/customer contact semantics and keeps conversation ids separately', async () => {
  const port = new FakePort();
  const service = new SupabaseChatService(port);
  const entries = await service.loadAdminDirectory();
  assert.equal(entries[0].contact.accountType, 'guest');
  assert.equal(entries[1].contact.accountType, 'customer');
  assert.equal(entries[0].conversationId, 'c1');
  assert.equal(entries[1].conversationId, 'c2');
});

test('send text uses existing idempotent RPC and mark read stays conversation-scoped', async () => {
  const port = new FakePort();
  const service = new SupabaseChatService(port);
  await service.sendText({ conversationId: 'c1', clientMessageId: '11111111-1111-4111-8111-111111111111', text: 'Xin chào', replyToId: null });
  await service.markRead('c1');
  const send = port.calls.find((x) => x[1] === 'chat_send_text_message');
  assert.equal(send[2].p_conversation_id, 'c1');
  assert.equal(send[2].p_text, 'Xin chào');
  assert.ok(port.calls.some((x) => x[1] === 'chat_mark_conversation_read'));
});
