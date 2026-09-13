import assert from 'node:assert/strict';
import {
  hashInviteKey,
  publicInviteState,
} from '../supabase/functions/v21-call-invite-guest/invite-core.mjs';

assert.equal(
  await hashInviteKey('abc'),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'guest key lookup uses canonical SHA-256',
);

const future={expires_at:'2026-09-13T00:10:00.000Z'};
const now=Date.parse('2026-09-13T00:00:00.000Z');
assert.equal(publicInviteState(future,now),'active');
assert.equal(publicInviteState({...future,opened_at:'2026-09-13T00:00:01.000Z'},now),'active');
assert.equal(publicInviteState({...future,revoked_at:'2026-09-13T00:00:01.000Z'},now),'revoked');
assert.equal(publicInviteState({...future,ended_at:'2026-09-13T00:00:01.000Z'},now),'ended');
assert.equal(publicInviteState({expires_at:'2026-09-13T00:00:00.000Z'},now),'expired');

console.log('call invite guest core contract PASS');
