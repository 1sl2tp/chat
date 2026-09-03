import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SupabaseAuthService } from '../.local-build/services/supabase/auth-service.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function authFixture() {
  const calls = [];
  const port = {
    auth: {
      async updateUser(input) { calls.push(['updateUser', input]); return { data: { user: { id: 'auth-u2' } }, error: null }; }
    },
    async rpc(name, args = {}) {
      calls.push(['rpc', name, args]);
      if (name === 'chat_update_user2_account') return { data: { id: 'u2', display_name: args.p_display_name, username: args.p_username, login_username: args.p_username }, error: null };
      throw new Error(`unexpected rpc ${name}`);
    }
  };
  return { port, calls };
}

test('registered user account update persists profile and only changes password when supplied', async () => {
  const f = authFixture();
  const service = new SupabaseAuthService(f.port, { loadDeviceKey: () => '11111111-1111-4111-8111-111111111111' });
  const profile = await service.updateRegisteredAccount({ name: 'User Hai', username: 'u2', password: '••••••' });
  assert.deepEqual(profile, { name: 'User Hai', username: 'u2' });
  assert.equal(f.calls.some(([kind]) => kind === 'updateUser'), false);

  await service.updateRegisteredAccount({ name: 'User Hai', username: 'u2', password: 'new-pass-123' });
  assert.deepEqual(f.calls.at(-1), ['updateUser', { password: 'new-pass-123' }]);
});

test('Supabase port exposes authenticated updateUser and main account sheet uses live auth service', () => {
  const port = read('src/services/supabase/port.ts');
  const adapter = read('src/services/supabase/supabase-js-port.ts');
  const main = read('src/main.ts');
  assert.match(port, /updateUser/);
  assert.match(adapter, /this\.auth = client\.auth/);
  assert.match(main, /liveAuthService/);
  assert.match(main, /updateRegisteredAccount/);
  assert.match(main, /runtimeSession\s*=\s*\{[\s\S]*profile:/);
});
