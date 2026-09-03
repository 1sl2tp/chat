import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('GitHub Pages build is relative-base safe for both /chat/ and a custom domain', () => {
  const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8');

  assert.match(vite, /base:\s*['"]\.\/['"]/);
  assert.match(html, /href=['"]\.\/manifest\.webmanifest['"]/);
  assert.match(html, /href=['"]\.\/icons\/app-icon\.svg['"]/);
  assert.match(html, /href=['"]\.\/icons\/apple-touch-icon\.png['"]/);
  assert.match(html, /href=['"]\.\/src\/styles\/tokens\.css['"]/);
  assert.match(html, /src=['"]\.\/src\/main\.ts['"]/);
  assert.doesNotMatch(html, /(?:href|src)=['"]\//);
  assert.match(manifest, /"start_url"\s*:\s*"\.\/"/);
  assert.match(manifest, /"scope"\s*:\s*"\.\/"/);
});
