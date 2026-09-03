import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin chat header delete uses live management before local fallback', () => {
  const main = read('src/main.ts');
  assert.match(main, /liveAdminDirectory[\s\S]*deleteContact\(peer\.id\)/);
  assert.match(main, /refreshAdminDirectory/);
});

test('missing production Supabase config no longer silently opens mock data', () => {
  const main = read('src/main.ts');
  assert.match(main, /isExplicitDemoMode/);
  assert.match(main, /showConfigurationError/);
  assert.doesNotMatch(main, /if \(!config\) \{\s*startMockRuntime\(\);\s*return;\s*\}/);
  const standalone = read('scripts/build-standalone.mjs');
  const smoke = read('tests/e2e-smoke.py');
  assert.match(standalone, /__TAPHOA_DEMO__/);
  assert.match(smoke, /__TAPHOA_DEMO__/);
});
