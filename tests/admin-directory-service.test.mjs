import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseAdminDirectoryService } from '../.local-build/services/supabase/admin-directory-service.js';

class FakePort {
  calls = [];
  auth = {};
  async rpc() { return { data: null, error: null }; }
  async select() { return { data: [], error: null }; }
  storage = { createSignedUrls: async () => ({ data: [], error: null }), upload: async () => ({ data: null, error: null }), remove: async () => ({ data: [], error: null }) };
  functions = {
    invoke: async (name, body) => {
      this.calls.push([name, body]);
      return { data: { ok: true }, error: null };
    }
  };
  subscribeToConversation() { return () => undefined; }
}

test('admin directory mutations go through the JWT-protected edge function instead of service-only RPCs', async () => {
  const port = new FakePort();
  const service = new SupabaseAdminDirectoryService(port);
  await service.createCustomer({ name: 'Lan', username: 'lan01', password: 'secret1' });
  await service.promoteGuest('11111111-1111-4111-8111-111111111111', { name: 'Nam', username: 'nam01', password: 'secret2' });
  await service.updateCustomer('22222222-2222-4222-8222-222222222222', { name: 'Mai', username: 'mai01', password: '' });
  await service.deleteContact('33333333-3333-4333-8333-333333333333');

  assert.deepEqual(port.calls, [
    ['taphoaxyz-admin-user', { action: 'create_user2', displayName: 'Lan', username: 'lan01', password: 'secret1' }],
    ['taphoaxyz-admin-user', { action: 'upgrade_guest', profileId: '11111111-1111-4111-8111-111111111111', displayName: 'Nam', username: 'nam01', password: 'secret2' }],
    ['taphoaxyz-admin-user', { action: 'update_user2', profileId: '22222222-2222-4222-8222-222222222222', displayName: 'Mai', username: 'mai01' }],
    ['taphoaxyz-admin-user', { action: 'delete_user', profileId: '33333333-3333-4333-8333-333333333333' }]
  ]);
});

test('admin customer password reset is a separate edge action only when a new password is supplied', async () => {
  const port = new FakePort();
  const service = new SupabaseAdminDirectoryService(port);
  await service.updateCustomer('22222222-2222-4222-8222-222222222222', { name: 'Mai', username: 'mai01', password: 'newpass' });
  assert.deepEqual(port.calls.map(([, body]) => body.action), ['update_user2', 'reset_password']);
  assert.equal(port.calls[1][1].password, 'newpass');
});
