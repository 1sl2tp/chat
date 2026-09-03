import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('GitHub Pages build injects only the public Supabase browser configuration', () => {
  const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /VITE_SUPABASE_URL:/);
  assert.match(workflow, /VITE_SUPABASE_PUBLISHABLE_KEY:/);
  assert.match(workflow, /vars\.VITE_SUPABASE_URL/);
  assert.match(workflow, /vars\.VITE_SUPABASE_PUBLISHABLE_KEY|secrets\.VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(workflow, /SERVICE_ROLE|SECRET_KEY|SUPABASE_SECRET/i);
  assert.match(workflow, /run:\s*npm install --no-audit --no-fund/);
  assert.match(workflow, /test -n \"\$VITE_SUPABASE_URL\"/);
  assert.match(workflow, /test -n \"\$VITE_SUPABASE_PUBLISHABLE_KEY\"/);
  assert.match(workflow, /run:\s*npm run build/);
});
