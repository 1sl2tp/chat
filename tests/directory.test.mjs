import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../.local-build/app/store.js';
import { contactActionLabels, filterContacts } from '../.local-build/directory/contact-actions.js';

test('guest actions are only Tạo and Xóa', () => {
  assert.deepEqual(contactActionLabels('guest'), ['Tạo', 'Xóa']);
});

test('customer actions are Sửa Nhóm Xóa', () => {
  assert.deepEqual(contactActionLabels('customer'), ['Sửa', 'Nhóm', 'Xóa']);
});

test('customer filter includes all customers even when custom-grouped', () => {
  const state = createInitialState();
  const result = filterContacts(state.contacts, 'customer', '');
  assert.ok(result.length >= 2);
  assert.ok(result.every((c) => c.accountType === 'customer'));
});

test('guest filter includes guests only and no all filter is needed', () => {
  const state = createInitialState();
  const result = filterContacts(state.contacts, 'guest', '');
  assert.ok(result.length >= 1);
  assert.ok(result.every((c) => c.accountType === 'guest'));
});

import { readFileSync } from 'node:fs';

test('directory keeps creation near the toolbar and customer grouping near the row', () => {
  const source = readFileSync(new URL('../src/directory/directory-screen.ts', import.meta.url), 'utf8');
  assert.match(source, /data-create-menu/);
  assert.match(source, /directory-quick-create/);
  assert.match(source, /contact-inline-group/);
});
