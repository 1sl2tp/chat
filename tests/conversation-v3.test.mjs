import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  latestOutgoingStatusId,
  messageActionLabels,
  callEventView,
  collectConversationMedia
} from '../.local-build/chat/message-contract.js';

const local = 'admin';
const peer = 'c1';

const base = {
  time: '09:40',
  senderId: local,
  recipientId: peer
};

test('only the latest outgoing message owns delivery status display', () => {
  const messages = [
    { ...base, id: 'a', kind: 'text', text: 'Một', status: 'seen' },
    { ...base, id: 'b', kind: 'text', text: 'Hai', status: 'sent' },
    { ...base, id: 'c', kind: 'text', senderId: peer, recipientId: local, text: 'Ba' }
  ];
  assert.equal(latestOutgoingStatusId(messages, local), 'b');
});

test('message action contract is type-specific and compact', () => {
  assert.deepEqual(messageActionLabels({ ...base, id: 't', kind: 'text', text: 'Xin chào' }), ['Trả lời', 'Sao chép']);
  assert.deepEqual(messageActionLabels({ ...base, id: 'l', kind: 'text', text: 'https://taphoa.xyz' }), ['Trả lời', 'Sao chép', 'Mở']);
  assert.deepEqual(messageActionLabels({ ...base, id: 'i', kind: 'image', images: ['data:image/png;base64,AA'] }), ['Trả lời', 'Lưu']);
  assert.deepEqual(messageActionLabels({ ...base, id: 'f', kind: 'file', fileName: 'a.pdf' }), ['Trả lời', 'Lưu']);
  assert.deepEqual(messageActionLabels({ ...base, id: 'a', kind: 'audio', audioDuration: 18 }), ['Trả lời', 'Lưu']);
  assert.deepEqual(messageActionLabels({ ...base, id: 's', kind: 'system', text: 'Hệ thống' }), []);
});

test('call event copy is relative to the viewer', () => {
  const completed = { ...base, id: 'call1', kind: 'call', call: { callerId: local, calleeId: peer, outcome: 'completed', durationSeconds: 134 } };
  assert.deepEqual(callEventView(completed, local), { label: 'Gọi đi · 02:14', canCallBack: false });
  assert.deepEqual(callEventView(completed, peer), { label: 'Gọi đến · 02:14', canCallBack: false });

  const missed = { ...base, id: 'call2', kind: 'call', call: { callerId: local, calleeId: peer, outcome: 'unanswered' } };
  assert.deepEqual(callEventView(missed, local), { label: 'Không trả lời', canCallBack: false });
  assert.deepEqual(callEventView(missed, peer), { label: 'Cuộc gọi nhỡ', canCallBack: true });
});

test('media manager derives items from the original conversation and keeps message ids', () => {
  const messages = [
    { ...base, id: 'img', kind: 'image', images: ['a', 'b'], text: 'Ảnh mẫu' },
    { ...base, id: 'file', kind: 'file', fileName: 'bao-gia.pdf' },
    { ...base, id: 'link', kind: 'text', text: 'Xem https://taphoa.xyz nhé' },
    { ...base, id: 'audio', kind: 'audio', audioDuration: 18 }
  ];
  const items = collectConversationMedia(messages);
  assert.equal(items.filter((item) => item.type === 'image').length, 2);
  assert.equal(items.filter((item) => item.type === 'file').length, 1);
  assert.equal(items.filter((item) => item.type === 'link').length, 1);
  assert.equal(items.filter((item) => item.type === 'audio').length, 1);
  assert.ok(items.every((item) => ['img', 'file', 'link', 'audio'].includes(item.messageId)));
});

test('composer exposes separate image camera and file quick actions', () => {
  const composer = readFileSync(new URL('../src/chat/composer.ts', import.meta.url), 'utf8');
  assert.match(composer, /data-attach-menu/);
  assert.match(composer, /data-pick-images/);
  assert.match(composer, /data-camera/);
  assert.match(composer, /data-pick-file/);
  assert.match(composer, /capture="environment"/);
});

test('chat screen owns a media manager with view-original navigation', () => {
  const chat = readFileSync(new URL('../src/chat/chat-screen.ts', import.meta.url), 'utf8');
  const media = readFileSync(new URL('../src/chat/media-manager.ts', import.meta.url), 'utf8');
  assert.match(chat, /openMedia\(\)/);
  assert.match(chat, /scrollToMessage/);
  assert.match(media, /Xem gốc/);
  assert.match(media, /Ảnh/);
  assert.match(media, /Tệp/);
  assert.match(media, /Link/);
  assert.match(media, /Ghi âm/);
});

test('message list renders appended messages but does not mutate the conversation store', () => {
  const list = readFileSync(new URL('../src/chat/message-list.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(list, /this\.#messages\.push\(message\)/);
});

test('runtime ids do not depend directly on secure-context randomUUID', () => {
  const sources = [
    '../src/app/overlay-manager.ts',
    '../src/chat/chat-screen.ts',
    '../src/call/call-controller.ts'
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(sources, /crypto\.randomUUID\(\)/);
});
