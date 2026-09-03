import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, promoteGuest, assignCustomerGroup, deleteCustomerGroup } from '../.local-build/app/store.js';
import { formatDirectoryTime } from '../.local-build/utils/time.js';

test('guest cannot be assigned a customer group', () => {
  const state = createInitialState();
  const guest = state.contacts.find((c) => c.accountType === 'guest');
  assert.ok(guest);
  assert.throws(() => assignCustomerGroup(state, guest.id, 'family'));
});

test('promoting guest creates customer semantics', () => {
  const state = createInitialState();
  const guest = state.contacts.find((c) => c.accountType === 'guest');
  assert.ok(guest);
  promoteGuest(state, guest.id, { username: 'khach1', password: '123456' });
  assert.equal(guest.accountType, 'customer');
  assert.equal(guest.username, 'khach1');
  assert.equal(guest.customerGroupId, null);
});

test('deleting custom group returns members to base customer', () => {
  const state = createInitialState();
  const customer = state.contacts.find((c) => c.accountType === 'customer');
  assert.ok(customer);
  state.groups.push({ id: 'family', name: 'Gia đình', builtIn: false });
  assignCustomerGroup(state, customer.id, 'family');
  deleteCustomerGroup(state, 'family');
  assert.equal(customer.customerGroupId, null);
  assert.equal(customer.accountType, 'customer');
});

test('relative directory time contract', () => {
  const now = new Date(2026, 8, 3, 10, 0);
  assert.equal(formatDirectoryTime(new Date(2026, 8, 3, 9, 40), now), '09:40');
  assert.equal(formatDirectoryTime(new Date(2026, 8, 2, 9, 40), now), 'Hôm qua');
  assert.equal(formatDirectoryTime(new Date(2026, 7, 20, 9, 40), now), '20/08');
  assert.equal(formatDirectoryTime(new Date(2025, 7, 20, 9, 40), now), '20/08/25');
});
