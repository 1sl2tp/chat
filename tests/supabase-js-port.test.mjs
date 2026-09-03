import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseJsPort } from '../.local-build/services/supabase/supabase-js-port.js';

class Query {
  calls = [];
  result = { data: [{ id: 'm1' }], error: null };
  select(columns) { this.calls.push(['select', columns]); return this; }
  eq(key, value) { this.calls.push(['eq', key, value]); return this; }
  in(key, value) { this.calls.push(['in', key, value]); return this; }
  order(column, options) { this.calls.push(['order', column, options]); return this; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
}

class Channel {
  bindings = [];
  on(kind, filter, handler) { this.bindings.push([kind, filter, handler]); return this; }
  subscribe() { this.subscribed = true; return this; }
}

test('Supabase JS port translates simple table filters without leaking query builders upward', async () => {
  const query = new Query();
  const client = {
    auth: {}, rpc: async () => ({ data: null, error: null }),
    from: () => query,
    storage: { from: () => ({}) },
    channel: () => new Channel(), removeChannel: async () => 'ok'
  };
  const port = new SupabaseJsPort(client);
  const result = await port.select('chat_messages', { columns: 'id', eq: { conversation_id: 'c1' }, in: { id: ['m1'] }, order: { column: 'created_at', ascending: true } });
  assert.equal(result.data[0].id, 'm1');
  assert.deepEqual(query.calls, [
    ['select', 'id'], ['eq', 'conversation_id', 'c1'], ['in', 'id', ['m1']], ['order', 'created_at', { ascending: true }]
  ]);
});

test('Supabase JS port binds message/read/call realtime changes to one conversation', () => {
  const channel = new Channel();
  const removed = [];
  const client = {
    auth: {}, rpc: async () => ({ data: null, error: null }), from: () => new Query(),
    storage: { from: () => ({}) },
    channel: (name) => { channel.name = name; return channel; },
    removeChannel: async (value) => { removed.push(value); return 'ok'; }
  };
  const port = new SupabaseJsPort(client);
  const stop = port.subscribeToConversation('conv-1', { onMessageChange() {}, onReadChange() {}, onCallChange() {} });
  assert.equal(channel.subscribed, true);
  assert.equal(channel.bindings.length, 3);
  assert.ok(channel.bindings.every(([, filter]) => filter.filter === 'conversation_id=eq.conv-1'));
  stop();
  assert.equal(removed[0], channel);
});

test('voice call realtime subscription watches participant-visible chat_calls changes', () => {
  const channel = new Channel();
  const client = {
    auth: {}, rpc: async () => ({ data: null, error: null }), from: () => new Query(),
    storage: { from: () => ({}) }, functions: { invoke: async () => ({ data: null, error: null }) },
    channel: (name) => { channel.name = name; return channel; },
    removeChannel: async () => 'ok'
  };
  const port = new SupabaseJsPort(client);
  assert.equal(typeof port.subscribeToVoiceCalls, 'function');
  port.subscribeToVoiceCalls(() => undefined);
  assert.equal(channel.subscribed, true);
  assert.equal(channel.bindings.length, 1);
  assert.equal(channel.bindings[0][1].table, 'chat_calls');
  assert.equal(channel.bindings[0][1].event, '*');
});
