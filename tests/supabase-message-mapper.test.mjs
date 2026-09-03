import test from 'node:test';
import assert from 'node:assert/strict';
import { mapConversationMessages, mapCallRow } from '../.local-build/services/supabase/message-mapper.js';

const base = {
  conversation_id: 'conv',
  client_message_id: 'client',
  edited_at: null,
  revoked_at: null,
  call_id: null,
  attachment: null
};
const formatTime = () => '09:40';

test('Supabase rows derive senderId/recipientId relative to the viewer', () => {
  const rows = [
    { ...base, id: 'a', sender_id: 'admin', type: 'text', text: 'Xin chào', reply_to_id: null, created_at: '2026-09-03T02:40:00Z' },
    { ...base, id: 'b', sender_id: 'user', type: 'text', text: 'Chào admin', reply_to_id: null, created_at: '2026-09-03T02:41:00Z' }
  ];
  const messages = mapConversationMessages(rows, { localProfileId: 'admin', peerProfileId: 'user', formatTime });
  assert.equal(messages[0].senderId, 'admin');
  assert.equal(messages[0].recipientId, 'user');
  assert.equal(messages[1].senderId, 'user');
  assert.equal(messages[1].recipientId, 'admin');
});

test('only the last outgoing data message receives sent/seen status', () => {
  const rows = [
    { ...base, id: 'a', sender_id: 'admin', type: 'text', text: 'Một', reply_to_id: null, created_at: '2026-09-03T02:40:00Z' },
    { ...base, id: 'b', sender_id: 'user', type: 'text', text: 'Hai', reply_to_id: null, created_at: '2026-09-03T02:41:00Z' },
    { ...base, id: 'c', sender_id: 'admin', type: 'text', text: 'Ba', reply_to_id: null, created_at: '2026-09-03T02:42:00Z' }
  ];
  const sent = mapConversationMessages(rows, { localProfileId: 'admin', peerProfileId: 'user', peerLastReadAt: '2026-09-03T02:41:30Z', formatTime });
  assert.equal(sent[0].status, undefined);
  assert.equal(sent[2].status, 'sent');
  const seen = mapConversationMessages(rows, { localProfileId: 'admin', peerProfileId: 'user', peerLastReadAt: '2026-09-03T02:43:00Z', formatTime });
  assert.equal(seen[2].status, 'seen');
});

test('attachment rows project into the original message source and replies use origin preview', () => {
  const rows = [
    { ...base, id: 't', sender_id: 'user', type: 'text', text: 'Báo giá', reply_to_id: null, created_at: '2026-09-03T02:40:00Z' },
    { ...base, id: 'i', sender_id: 'admin', type: 'image', text: 'Ảnh đây', reply_to_id: 't', created_at: '2026-09-03T02:41:00Z', attachment: { kind: 'image', name: 'a.jpg', mime: 'image/jpeg', path: 'conv/admin/a.jpg', size: 12 } },
    { ...base, id: 'f', sender_id: 'user', type: 'file', text: null, reply_to_id: null, created_at: '2026-09-03T02:42:00Z', attachment: { kind: 'file', name: 'bao-gia.pdf', mime: 'application/pdf', path: 'conv/user/bao-gia.pdf', size: 22 } },
    { ...base, id: 'r', sender_id: 'user', type: 'audio', text: null, reply_to_id: null, created_at: '2026-09-03T02:43:00Z', attachment: { kind: 'audio', name: 'voice.webm', mime: 'audio/webm', path: 'conv/user/voice.webm', size: 33, durationSeconds: 17 } }
  ];
  const messages = mapConversationMessages(rows, {
    localProfileId: 'admin', peerProfileId: 'user', formatTime,
    attachmentUrls: new Map([
      ['conv/admin/a.jpg', 'signed:image'],
      ['conv/user/bao-gia.pdf', 'signed:file'],
      ['conv/user/voice.webm', 'signed:audio']
    ])
  });
  assert.deepEqual(messages[1].images, ['signed:image']);
  assert.equal(messages[1].replyTo, 'Báo giá');
  assert.equal(messages[2].fileName, 'bao-gia.pdf');
  assert.equal(messages[2].fileUrl, 'signed:file');
  assert.equal(messages[3].audioUrl, 'signed:audio');
  assert.equal(messages[3].audioDuration, 17);
});

test('call rows preserve V3 completed/unanswered/cancelled timeline semantics', () => {
  assert.deepEqual(mapCallRow({ id: '1', caller_profile_id: 'admin', callee_profile_id: 'user', connected_at: '2026-09-03T02:40:00Z', ended_at: '2026-09-03T02:42:14Z', state: 'ended', end_reason: 'ended' }), {
    callerId: 'admin', calleeId: 'user', outcome: 'completed', durationSeconds: 134
  });
  assert.equal(mapCallRow({ id: '2', caller_profile_id: 'admin', callee_profile_id: 'user', connected_at: null, ended_at: '2026-09-03T02:40:00Z', state: 'missed', end_reason: 'ring_timeout' }).outcome, 'unanswered');
  assert.equal(mapCallRow({ id: '3', caller_profile_id: 'admin', callee_profile_id: 'user', connected_at: null, ended_at: '2026-09-03T02:40:00Z', state: 'cancelled', end_reason: 'caller_cancelled' }).outcome, 'cancelled');
});
