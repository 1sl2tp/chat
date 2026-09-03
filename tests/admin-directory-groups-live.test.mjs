import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SupabaseAdminDirectoryService } from '../.local-build/services/supabase/admin-directory-service.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function fixture() {
  const calls = [];
  const port = {
    functions: { async invoke() { return { data: { ok: true }, error: null }; } },
    async rpc(name, args = {}) {
      calls.push([name, args]);
      if (name === 'chat_admin_list_directory_groups') return { data: [
        { group_id: '11111111-1111-4111-8111-111111111111', name: 'Gia đình', profile_ids: ['u2-a'] }
      ], error: null };
      if (name === 'chat_admin_create_directory_group') return { data: { group_id: '22222222-2222-4222-8222-222222222222', name: String(args.p_name ?? '') }, error: null };
      if (name === 'chat_admin_delete_directory_group') return { data: true, error: null };
      if (name === 'chat_admin_assign_directory_group') return { data: true, error: null };
      throw new Error(`unexpected rpc ${name}`);
    }
  };
  return { port, calls };
}

test('admin directory service persists custom groups and assignments through admin-only RPCs', async () => {
  const f = fixture();
  const service = new SupabaseAdminDirectoryService(f.port);
  assert.deepEqual(await service.loadGroups(), [{ id: '11111111-1111-4111-8111-111111111111', name: 'Gia đình', profileIds: ['u2-a'] }]);
  await service.createGroup('VIP');
  await service.assignGroup('u2-a', '11111111-1111-4111-8111-111111111111');
  await service.assignGroup('u2-a', null);
  await service.deleteGroup('11111111-1111-4111-8111-111111111111');
  assert.deepEqual(f.calls.map(([name]) => name), [
    'chat_admin_list_directory_groups',
    'chat_admin_create_directory_group',
    'chat_admin_assign_directory_group',
    'chat_admin_assign_directory_group',
    'chat_admin_delete_directory_group'
  ]);
});

test('directory UI routes group mutations through live management when supplied', () => {
  const source = read('src/directory/directory-screen.ts');
  const main = read('src/main.ts');
  assert.match(source, /management\.createGroup/);
  assert.match(source, /management\.deleteGroup/);
  assert.match(source, /management\.assignGroup/);
  assert.match(main, /loadGroups\(\)/);
  assert.match(main, /assignGroup\(peer\.id/);
});

test('group migration is admin-only, RLS-enabled, and revokes anon/public table access', () => {
  const sql = read('supabase/migrations/20260903_admin_directory_groups.sql');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /chat_admin_list_directory_groups/);
  assert.match(sql, /chat_admin_create_directory_group/);
  assert.match(sql, /chat_admin_delete_directory_group/);
  assert.match(sql, /chat_admin_assign_directory_group/);
  assert.match(sql, /is_admin/i);
  assert.match(sql, /unique index[\s\S]*admin_profile_id[\s\S]*lower\(name\)/i);
  assert.match(sql, /revoke all on .*chat_admin_directory_groups.* from public, anon, authenticated/is);
  assert.match(sql, /grant execute on function .* to authenticated/is);
});
