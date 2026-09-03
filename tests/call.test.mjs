import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callViewModel, formatCallDuration } from '../.local-build/call/call-controller.js';
import { NotificationQueue } from '../.local-build/services/notifications.js';

test('outgoing connecting has no duration', () => {
  const view = callViewModel({ phase: 'connecting', direction: 'outgoing', peerName: 'Nguyễn Minh', peerInitials: 'NM', muted: false, minimized: false, startedAt: null });
  assert.equal(view.status, 'Đang gọi…');
  assert.equal(view.showDuration, false);
});

test('connected call exposes duration', () => {
  const view = callViewModel({ phase: 'connected', direction: 'outgoing', peerName: 'Nguyễn Minh', peerInitials: 'NM', muted: false, minimized: false, startedAt: 1000 });
  assert.equal(view.status, 'Đang trong cuộc gọi');
  assert.equal(view.showDuration, true);
  assert.equal(formatCallDuration(65), '01:05');
});

test('notification queue holds while blocked and flushes later', () => {
  const shown = [];
  const queue = new NotificationQueue((item) => shown.push(item.text));
  queue.setBlocked(true);
  queue.notify({ text: 'Tin mới' });
  assert.deepEqual(shown, []);
  queue.setBlocked(false);
  assert.deepEqual(shown, ['Tin mới']);
});

test('CallController keeps mock timer/history fallback but delegates live call lifecycle through bound service', () => {
  const source = readFileSync(new URL('../src/call/call-controller.ts', import.meta.url), 'utf8');
  assert.match(source, /bindService\(/);
  assert.match(source, /startOutgoing\(\{\s*conversationId/);
  assert.match(source, /acceptIncoming\(\)/);
  assert.match(source, /setMuted\(/);
  assert.match(source, /service\.end\(\)/);
  assert.match(source, /this\.#service\s*\?\s*null\s*:\s*this\.createHistoryEvent/);
  assert.ok((source.match(/this\.#service\.startAudio\(\)/g) ?? []).length >= 3, 'Gọi/Nhận/restore must unlock audio from a user gesture');
});
