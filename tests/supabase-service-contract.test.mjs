import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Supabase gateway uses only the locked 1:1 auth/chat RPC surface', () => {
  const auth = read('src/services/supabase/auth-service.ts');
  const chat = read('src/services/supabase/chat-service.ts');
  const all = `${auth}\n${chat}`;
  for (const rpc of ['chat_bootstrap_identity', 'chat_resolve_identity', 'chat_get_support_entry', 'chat_admin_support_inbox', 'chat_send_text_message', 'chat_send_attachment_message', 'chat_mark_conversation_read']) {
    assert.match(all, new RegExp(rpc));
  }
  assert.doesNotMatch(all, /friend|privacy|crm|ticket/i);
  assert.doesNotMatch(all, /service[_-]?role/i);
});

test('Supabase browser config requires URL plus publishable key and never embeds a real key', () => {
  const config = read('src/services/supabase/config.ts');
  const env = read('.env.example');
  assert.match(config, /VITE_SUPABASE_URL/);
  assert.match(config, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(env, /VITE_SUPABASE_URL=/);
  assert.match(env, /VITE_SUPABASE_PUBLISHABLE_KEY=/);
  assert.doesNotMatch(env, /sb_publishable_[A-Za-z0-9_-]{8,}/);
  assert.doesNotMatch(env, /eyJ[A-Za-z0-9_-]{20,}/);
});

test('Supabase JS is exact-pinned for reproducible V3 packaging', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies?.['@supabase/supabase-js'], '2.112.4');
});
