import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('chat primary owns exactly message scroll + composer rows', () => {
  const css = read('src/styles/ui.css');
  assert.match(css, /\.chat-primary\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/s);
  assert.match(css, /\.message-list\s*\{[^}]*overflow-y:\s*auto/s);
});

test('composer is not fixed and owns bottom safe area', () => {
  const css = read('src/styles/ui.css');
  const match = css.match(/\.composer-owner\s*\{([^}]*)\}/s);
  assert.ok(match);
  assert.doesNotMatch(match[1], /position:\s*fixed/);
  assert.match(match[1], /safe-area-inset-bottom/);
});

test('media manager replaces chat body on mobile and becomes an inner chat panel on desktop', () => {
  const css = read('src/styles/ui.css');
  assert.match(css, /\.chat-screen\.media-open\s+\.chat-primary\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media \(min-width:\s*900px\)[\s\S]*\.chat-screen\.media-open\s*\{[^}]*grid-template-columns:[^}]*320px/s);
  assert.match(css, /@media \(min-width:\s*900px\)[\s\S]*\.chat-screen\.media-open\s+\.chat-primary\s*\{[^}]*display:\s*grid/s);
});

test('chat subject menu is anchored popover rather than bottom action sheet', () => {
  const main = read('src/main.ts');
  assert.match(main, /openPopover\(anchor/);
  assert.doesNotMatch(main, /openSheet\(\{ title: peer\.name/);
});

test('280px composer compacts only owner spacing without shrinking mobile input text', () => {
  const css = read('src/styles/ui.css');
  assert.match(css, /@media \(max-width:\s*300px\)[\s\S]*?\.composer-normal\s*\{[^}]*gap:\s*2px[^}]*\}[\s\S]*?\.composer-normal textarea\s*\{[^}]*padding-left:\s*6px;[^}]*padding-right:\s*6px;[^}]*\}/s);
  const layout = read('src/styles/layout.css');
  assert.match(layout, /@media \(pointer:\s*coarse\),\s*\(max-width:\s*640px\)[\s\S]*input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*16px\s*!important/s);
});
