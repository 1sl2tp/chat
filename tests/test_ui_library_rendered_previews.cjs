// UI-only component previews must be represented, not fall back to one generic mock shell.
// No browser, DB, Supabase, or network access is needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'ui-library', 'index.html'), 'utf8');
const inventory = page.match(/<script id="ui-inventory" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(inventory, 'UI inventory missing');
const items = JSON.parse(inventory[1]);
const begin = page.indexOf('function sourcePreview(item){');
const end = page.indexOf('function listFiltered()', begin);
assert.ok(begin >= 0 && end > begin, 'Source preview code missing');
const snippets = page.slice(begin, end);
const make = vm.runInNewContext(
  snippets + '\n markup;',
  {
    esc: value => String(value ?? ''),
    svg: () => '<svg aria-hidden="true"></svg>',
    button: (name, label) => '<button type="button">' + String(label) + '</button>'
  },
  { timeout: 3000 }
);
const unknown = [];
for (const item of items) {
  const rendered = make(item);
  assert.equal(typeof rendered, 'string', item.id);
  assert.ok(rendered.trim(), item.id + ': preview empty');
  if (rendered.includes('class="mini-shell"')) unknown.push(item.id + ':' + item.demo);
}
assert.deepEqual(unknown, [], 'components with generic fallback instead of a matching preview');
assert.ok(items.length >= 246, 'B+ fake typing control was removed from Chat (UI-207)');
console.log('PASS: ' + items.length + ' mapped Chat components have specific UI previews');
