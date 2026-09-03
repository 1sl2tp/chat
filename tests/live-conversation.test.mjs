import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveConversationSession } from '../.local-build/chat/live-conversation.js';

function sourceFixture() {
  const calls = [];
  let handler = null;
  let messages = [{ id: 'm1', senderId: 'peer', recipientId: 'me', kind: 'text', text: 'A', time: '09:00' }];
  return {
    calls,
    setMessages(next) { messages = next; },
    emit(kind) { handler?.(kind); },
    source: {
      async load() { calls.push(['load']); return messages; },
      async send(message) { calls.push(['send', message.id, message.kind]); },
      async markRead() { calls.push(['read']); },
      subscribe(next) { calls.push(['subscribe']); handler = next; return () => { calls.push(['unsubscribe']); handler = null; }; }
    }
  };
}

test('live conversation initial load paints source messages and marks the open conversation read once', async () => {
  const f = sourceFixture();
  const paints = [];
  const session = new LiveConversationSession(f.source, (messages) => paints.push(messages.map((m) => m.id)));
  await session.start();
  assert.deepEqual(paints, [['m1']]);
  assert.deepEqual(f.calls, [['subscribe'], ['load'], ['read']]);
  session.stop();
  assert.equal(f.calls.at(-1)[0], 'unsubscribe');
});

test('message realtime refresh marks read but read/call refreshes never create read loops', async () => {
  const f = sourceFixture();
  const session = new LiveConversationSession(f.source, () => undefined);
  await session.start();
  f.calls.length = 0;
  f.emit('message');
  await session.whenIdle();
  assert.deepEqual(f.calls, [['load'], ['read']]);
  f.calls.length = 0;
  f.emit('read');
  await session.whenIdle();
  assert.deepEqual(f.calls, [['load']]);
  f.calls.length = 0;
  f.emit('call');
  await session.whenIdle();
  assert.deepEqual(f.calls, [['load']]);
});

test('send delegates to source and reloads canonical messages after success', async () => {
  const f = sourceFixture();
  const paints = [];
  const session = new LiveConversationSession(f.source, (messages) => paints.push(messages.map((m) => m.id)));
  await session.start();
  f.calls.length = 0;
  f.setMessages([{ id: 'server-id', senderId: 'me', recipientId: 'peer', kind: 'text', text: 'B', time: '09:01', status: 'sent' }]);
  await session.send({ id: 'client-id', senderId: 'me', recipientId: 'peer', kind: 'text', text: 'B', time: '09:01', status: 'sending' });
  assert.deepEqual(f.calls, [['send', 'client-id', 'text'], ['load']]);
  assert.deepEqual(paints.at(-1), ['server-id']);
});
