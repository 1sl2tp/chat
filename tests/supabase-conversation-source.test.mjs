import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseConversationSource } from '../.local-build/runtime/supabase-conversation-source.js';

class FakeChatService {
  calls = [];
  async loadConversation(input) { this.calls.push(['load', input]); return [{ id: 'm1', senderId: 'peer', recipientId: 'me', kind: 'text', text: 'A', time: '09:00' }]; }
  async sendText(input) { this.calls.push(['text', input]); }
  async markRead(conversationId) { this.calls.push(['read', conversationId]); }
  subscribe(conversationId, onChange) { this.calls.push(['subscribe', conversationId]); this.onChange = onChange; return () => this.calls.push(['unsubscribe', conversationId]); }
}

const binding = { conversationId: 'conv1', localProfileId: 'me', peerProfileId: 'peer' };

test('supabase conversation source keeps conversation/profile binding out of ChatScreen', async () => {
  const service = new FakeChatService();
  const source = new SupabaseConversationSource(service, binding);
  const messages = await source.load();
  assert.equal(messages[0].id, 'm1');
  assert.deepEqual(service.calls[0], ['load', binding]);
  await source.markRead();
  assert.deepEqual(service.calls[1], ['read', 'conv1']);
});

test('supabase conversation source sends text idempotently using UI message id and reply origin id', async () => {
  const service = new FakeChatService();
  const source = new SupabaseConversationSource(service, binding);
  await source.send({ id: '11111111-1111-4111-8111-111111111111', senderId: 'me', recipientId: 'peer', kind: 'text', text: 'Xin chào', replyTo: 'Tin cũ', replyToId: 'origin-1', time: '09:02', status: 'sending' });
  assert.deepEqual(service.calls[0], ['text', {
    conversationId: 'conv1', clientMessageId: '11111111-1111-4111-8111-111111111111', text: 'Xin chào', replyToId: 'origin-1'
  }]);
});

test('supabase conversation source forwards realtime reason and rejects media only when the source File is missing', async () => {
  const service = new FakeChatService();
  const source = new SupabaseConversationSource(service, binding);
  const seen = [];
  const stop = source.subscribe((kind) => seen.push(kind));
  service.onChange('message');
  service.onChange('read');
  service.onChange('call');
  assert.deepEqual(seen, ['message', 'read', 'call']);
  stop();
  await assert.rejects(() => source.send({ id: 'x', senderId: 'me', recipientId: 'peer', kind: 'file', fileName: 'a.pdf', time: '09:03' }), /file required/i);
});
