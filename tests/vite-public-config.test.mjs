import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const path = new URL('../vite.config.ts', import.meta.url);

test('Vite exposes only Supabase browser URL and publishable key', async () => {
  const source = await readFile(path, 'utf8');
  assert.match(source, /VITE_SUPABASE_URL/);
  assert.match(source, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source, /__TAPHOA_SUPABASE_URL__/);
  assert.match(source, /__TAPHOA_SUPABASE_PUBLISHABLE_KEY__/);
  assert.doesNotMatch(source, /SERVICE_ROLE|SECRET_KEY|SUPABASE_SECRET/i);
});
