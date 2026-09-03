import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20260903_remove_chat_prototype_anon_read.sql', import.meta.url), 'utf8');

test('security migration removes only the four legacy anon-readable Chat prototype policies', () => {
  for (const policy of [
    'chat prototype profiles readable',
    'chat prototype conversations readable',
    'chat prototype memberships readable',
    'chat prototype messages readable'
  ]) assert.match(sql, new RegExp(`drop policy if exists "${policy}"`));
  assert.equal((sql.match(/drop policy if exists/g) ?? []).length, 4);
});

test('security migration revokes anon table reads but does not revoke authenticated access or mutate data', () => {
  for (const table of ['chat_profiles', 'chat_conversations', 'chat_conversation_members', 'chat_messages']) {
    assert.match(sql, new RegExp(`revoke select on table public\\.${table} from anon`));
  }
  assert.doesNotMatch(sql, /from authenticated|delete\s+from|truncate|drop\s+table|alter\s+table/i);
});
