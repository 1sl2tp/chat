import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeViewportMetrics } from '../.local-build/app/viewport.js';

const root = new URL('../', import.meta.url);

test('viewport meta keeps zoom available and enables resize-content', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
});

test('visual viewport metrics shrink app and expose keyboard height', () => {
  assert.deepEqual(
    computeViewportMetrics({ innerHeight: 800, visualHeight: 500, offsetTop: 0 }),
    { appHeight: 500, keyboardHeight: 300, offsetTop: 0 }
  );
});

test('child layout css never owns viewport height', () => {
  const css = ['tokens.css', 'layout.css'].map((name) => readFileSync(new URL(`../src/styles/${name}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(css, /100(?:d|s|l)?vh/i);
});
