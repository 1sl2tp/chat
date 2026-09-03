import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('auth gate offers exactly guest continuation and existing-account login', () => {
  const source = read('src/auth/auth-gate.ts');
  assert.match(source, /Tiếp tục vãng lai/);
  assert.match(source, /Đã có tài khoản/);
  assert.match(source, /name="username"/);
  assert.match(source, /name="password"/);
  assert.doesNotMatch(source, /Đăng ký|Tạo tài khoản|CRM|ticket/i);
});

test('auth gate is a separate full-screen owner and does not alter chat/composer geometry', () => {
  const css = read('src/styles/ui.css');
  assert.match(css, /\.auth-gate-screen\s*\{/);
  assert.match(css, /\.auth-gate-card\s*\{/);
  assert.doesNotMatch(css, /\.composer-owner[^}]*position:\s*fixed/s);
});

test('auth gate does not expose email convention or hardcoded passwords in UI copy', () => {
  const source = read('src/auth/auth-gate.ts');
  assert.doesNotMatch(source, /@taphoa\.chat/);
  assert.doesNotMatch(source, /admin123|password\s*=\s*["'][^"']+["']/i);
});
