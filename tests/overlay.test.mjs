import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { destructiveConfirmCopy } from '../.local-build/app/overlay-manager.js';

test('destructive confirmations use explicit delete copy', () => {
  assert.deepEqual(destructiveConfirmCopy('Nguyễn Minh'), {
    title: 'Xóa Nguyễn Minh?',
    message: 'Thao tác này không thể hoàn tác.',
    confirmLabel: 'Xóa',
    cancelLabel: 'Hủy'
  });
});

test('central z tokens keep call above sheets and normal status below call', () => {
  const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
  const values = Object.fromEntries([...css.matchAll(/--z-([a-z-]+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  assert.ok(values.status < values.sheet);
  assert.ok(values.sheet < values.call);
});
