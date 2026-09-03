import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaphoaSupabasePort } from '../.local-build/services/supabase/client.js';

class Channel { on() { return this; } subscribe() { return this; } }

test('client factory passes only URL/publishable key and browser session defaults to Supabase JS', () => {
  let args;
  const client = {
    auth: {}, rpc: async () => ({ data: null, error: null }), from: () => ({}),
    storage: { from: () => ({}) }, channel: () => new Channel(), removeChannel: async () => 'ok'
  };
  const port = createTaphoaSupabasePort(
    { url: 'https://example.supabase.co', publishableKey: 'publishable-test' },
    (...received) => { args = received; return client; }
  );
  assert.ok(port);
  assert.equal(args[0], 'https://example.supabase.co');
  assert.equal(args[1], 'publishable-test');
  assert.deepEqual(args[2].auth, { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true });
});
