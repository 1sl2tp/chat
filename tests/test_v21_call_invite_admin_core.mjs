import assert from 'node:assert/strict';
import {
  INVITE_TTL_MS,
  hashInviteKey,
  makeInviteKey,
  makeRoomName,
  inviteState,
} from '../supabase/functions/v21-call-invite-admin/invite-core.mjs';

assert.equal(INVITE_TTL_MS, 10 * 60 * 1000, 'invite TTL is exactly ten minutes');

const digest = await hashInviteKey('abc');
assert.match(digest, /^[0-9a-f]{64}$/, 'invite key is stored as SHA-256 hex');
assert.equal(
  digest,
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'hashing is canonical SHA-256',
);

const key = makeInviteKey();
assert.match(key, /^[A-Za-z0-9_-]{32,}$/, 'invite key is high-entropy URL-safe text');
assert.ok(!key.includes('='), 'invite key has no base64 padding');

assert.equal(
  makeRoomName('123e4567-e89b-12d3-a456-426614174000'),
  'taphoa-guest-123e4567e89b12d3a456426614174000',
  'room name is server-derived from invite id',
);

const active = { expires_at: '2026-09-13T00:10:00.000Z' };
assert.equal(inviteState(active, Date.parse('2026-09-13T00:00:00.000Z')), 'active');
assert.equal(inviteState(active, Date.parse('2026-09-13T00:10:00.000Z')), 'expired');
assert.equal(
  inviteState({ ...active, revoked_at: '2026-09-13T00:01:00.000Z' }, Date.parse('2026-09-13T00:02:00.000Z')),
  'revoked',
);
assert.equal(
  inviteState({ ...active, ended_at: '2026-09-13T00:01:00.000Z' }, Date.parse('2026-09-13T00:02:00.000Z')),
  'ended',
);

console.log('call invite Admin core contract PASS');
