import test from 'node:test';
import assert from 'node:assert/strict';
import { createUuid } from '../.local-build/utils/id.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('createUuid always returns a database-safe UUID v4 without UI prefixes', () => {
  const value = createUuid();
  assert.match(value, UUID_V4);
  assert.doesNotMatch(value, /^msg-/);
});
