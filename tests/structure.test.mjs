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

test('mobile viewport has separate idle and editing geometry contracts', () => {
  assert.deepEqual(
    computeViewportMetrics({ innerHeight: 800, visualHeight: 500, offsetTop: 120, editing: false }),
    { appHeight: 800, keyboardHeight: 0, offsetTop: 0, mode: 'idle' }
  );
  assert.deepEqual(
    computeViewportMetrics({ innerHeight: 800, visualHeight: 500, offsetTop: 120, editing: true }),
    { appHeight: 500, keyboardHeight: 180, offsetTop: 120, mode: 'editing' }
  );
});

test('viewport controller refreshes geometry on mobile input focus transitions', () => {
  const source = readFileSync(new URL('../src/app/viewport.ts', import.meta.url), 'utf8');
  assert.match(source, /document\.addEventListener\('focusin'/);
  assert.match(source, /document\.addEventListener\('focusout'/);
  assert.match(source, /dataset\.viewportMode\s*=\s*metrics\.mode/);
});

test('app root follows VisualViewport offset so keyboard top and composer stay adjacent on iOS', () => {
  const css = readFileSync(new URL('../src/styles/layout.css', import.meta.url), 'utf8');
  assert.match(css, /#app-root\s*\{[^}]*transform:\s*translateY\(var\(--viewport-offset-top\)\)/s);
});

test('child layout css never owns viewport height', () => {
  const css = ['tokens.css', 'layout.css'].map((name) => readFileSync(new URL(`../src/styles/${name}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(css, /100(?:d|s|l)?vh/i);
});
