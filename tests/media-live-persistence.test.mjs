import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SupabaseConversationSource } from '../.local-build/runtime/supabase-conversation-source.js';
import { mapConversationMessages } from '../.local-build/services/supabase/message-mapper.js';

const binding = { conversationId: 'conv1', localProfileId: 'me', peerProfileId: 'peer' };

class FakeChatService {
  calls = [];
  async loadConversation() { return []; }
  async sendText(input) { this.calls.push(['text', input]); }
  async sendAttachment(input) { this.calls.push(['attachment', input]); }
  async markRead() {}
  subscribe() { return () => undefined; }
}

test('live image send keeps File objects, uploads each image, and groups them under one UI message id', async () => {
  const service = new FakeChatService();
  const source = new SupabaseConversationSource(service, binding);
  const first = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
  const second = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
  const message = { id: '11111111-1111-4111-8111-111111111111', senderId: 'me', recipientId: 'peer', kind: 'image', text: 'Hai ảnh', replyToId: 'origin', time: '09:00', status: 'sending' };
  await source.send(message, { imageFiles: [first, second] });
  const calls = service.calls.filter(([kind]) => kind === 'attachment').map(([, input]) => input);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].clientMessageId, message.id);
  assert.equal(calls[0].groupId, message.id);
  assert.equal(calls[0].groupIndex, 0);
  assert.equal(calls[0].groupTotal, 2);
  assert.equal(calls[0].replyToId, 'origin');
  assert.equal(calls[1].groupIndex, 1);
  assert.notEqual(calls[1].clientMessageId, message.id);
});

test('live file send passes the original File and reply metadata to storage service', async () => {
  const service = new FakeChatService();
  const source = new SupabaseConversationSource(service, binding);
  const file = new File(['pdf'], 'bao gia.pdf', { type: 'application/pdf' });
  await source.send({ id: '22222222-2222-4222-8222-222222222222', senderId: 'me', recipientId: 'peer', kind: 'file', fileName: file.name, replyToId: 'origin', time: '09:01', status: 'sending' }, { file });
  assert.equal(service.calls[0][0], 'attachment');
  assert.equal(service.calls[0][1].file, file);
  assert.equal(service.calls[0][1].replyToId, 'origin');
});

test('mapper collapses attachment rows with the same group id back into one image message', () => {
  const base = { conversation_id: 'conv1', client_message_id: 'client', edited_at: null, revoked_at: null, call_id: null };
  const rows = [
    { ...base, id: 'origin', sender_id: 'peer', type: 'text', text: 'Gốc', reply_to_id: null, created_at: '2026-09-03T02:39:00Z', attachment: null },
    { ...base, id: 'i1', sender_id: 'me', type: 'image', text: 'Hai ảnh', reply_to_id: null, created_at: '2026-09-03T02:40:00Z', attachment: { kind: 'image', name: 'a.jpg', mime: 'image/jpeg', path: 'conv1/me/a.jpg', size: 1, group_id: 'group-1', group_index: 0, group_total: 2, reply_to_id: 'origin' } },
    { ...base, id: 'i2', sender_id: 'me', type: 'image', text: null, reply_to_id: null, created_at: '2026-09-03T02:40:01Z', attachment: { kind: 'image', name: 'b.jpg', mime: 'image/jpeg', path: 'conv1/me/b.jpg', size: 1, group_id: 'group-1', group_index: 1, group_total: 2, reply_to_id: 'origin' } }
  ];
  const messages = mapConversationMessages(rows, { localProfileId: 'me', peerProfileId: 'peer', formatTime: () => '09:40', attachmentUrls: new Map([['conv1/me/a.jpg','signed:a'],['conv1/me/b.jpg','signed:b']]) });
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1].images, ['signed:a', 'signed:b']);
  assert.equal(messages[1].text, 'Hai ảnh');
  assert.equal(messages[1].replyToId, 'origin');
  assert.equal(messages[1].replyTo, 'Gốc');
});

test('composer retains source File objects separately from blob preview URLs', () => {
  const source = readFileSync(new URL('../src/chat/composer.ts', import.meta.url), 'utf8');
  assert.match(source, /#pendingImages:\s*Array<\{\s*file:\s*File;\s*url:\s*string\s*\}>/);
  assert.match(source, /imageFiles:\s*this\.#pendingImages\.map\(\(item\)\s*=>\s*item\.file\)/);
  assert.match(source, /file:\s*this\.#pendingFile\?\.file/);
});
