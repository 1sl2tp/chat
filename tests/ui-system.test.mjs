import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mockConversation } from '../.local-build/services/mock-data.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('icon system uses parent-owned standard sizing and no numeric call-site overrides', () => {
  const icons = read('src/ui/icons.ts');
  const src = ['src/app/shell.ts','src/chat/composer.ts','src/chat/message-list.ts','src/call/call-full.ts','src/call/call-mini.ts','src/directory/contact-row.ts','src/directory/directory-screen.ts']
    .map(read).join('\n');
  const css = read('src/styles/layout.css') + '\n' + read('src/styles/ui.css');
  assert.doesNotMatch(src, /icon\([^\n)]*,\s*\d+\)/);
  assert.match(icons, /width="1em" height="1em"/);
  assert.match(css, /\.icon-button\s*\{[^}]*--icon-size:\s*18px/s);
  assert.match(css, /\.icon-button\.compact\s*\{[^}]*--icon-size:\s*16px/s);
  assert.match(css, /\.ui-icon\s*\{[^}]*width:\s*var\(--icon-size/s);
});

test('scrollbar contract hides touch scrollbars and keeps a slim desktop scrollbar', () => {
  const css = read('src/styles/ui.css');
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*scrollbar-width:\s*none/);
  assert.match(css, /@media \(pointer: fine\)[\s\S]*scrollbar-width:\s*thin/);
});

test('font and PWA packaging are declared without bundled font binaries', () => {
  const html = read('index.html');
  const css = read('src/styles/layout.css');
  assert.match(html, /Plus\+Jakarta\+Sans/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /apple-touch-icon/);
  assert.match(css, /"Plus Jakarta Sans"/);
  for (const path of ['public/manifest.webmanifest','public/icons/app-icon.svg','public/icons/icon-192.png','public/icons/icon-512.png','public/icons/maskable-512.png','public/icons/apple-touch-icon.png']) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path);
  }
});

test('desktop admin has an explicit two-pane workspace owner', () => {
  const css = read('src/styles/ui.css');
  const main = read('src/main.ts');
  assert.match(css, /@media \(min-width:\s*900px\)[\s\S]*\.admin-workspace\s*\{[^}]*grid-template-columns:/s);
  assert.match(main, /AdminWorkspace/);
});

test('mock conversation covers the approved chat stress types', () => {
  const messages = mockConversation('Nguyễn Minh', 'admin', 'c1');
  assert.ok(messages.some((m) => m.kind === 'text' && m.replyTo));
  assert.ok(messages.some((m) => m.kind === 'audio'));
  assert.ok(messages.some((m) => m.kind === 'file'));
  assert.ok(messages.some((m) => m.kind === 'system'));
  const imageCounts = messages.filter((m) => m.kind === 'image').map((m) => m.images?.length ?? 0);
  for (const count of [1,2,3,5]) assert.ok(imageCounts.includes(count), `image count ${count}`);
  assert.equal(messages.filter((m) => m.senderId === 'admin' && m.status).length, 1, 'only latest outgoing shows status');
});

test('shell and composer use the shared icon library for navigation, call, menu and attachment', () => {
  const shell = read('src/app/shell.ts');
  const composer = read('src/chat/composer.ts');
  assert.match(shell, /icon\('back'\)/);
  assert.match(shell, /icon\('call'\)/);
  assert.match(shell, /icon\('more'\)/);
  assert.match(composer, /icon\('plus'\)/);
  assert.match(composer, /icon\('camera'\)/);
  assert.match(composer, /icon\('file'\)/);
  assert.doesNotMatch(shell, />←<|>☎<|>⋯</);
});
