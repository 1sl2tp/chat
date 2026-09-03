import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/chat/message-list.ts', import.meta.url), 'utf8');

test('live audio messages play the signed attachment URL instead of simulating playback', () => {
  assert.match(source, /message\.audioUrl/);
  assert.match(source, /new Audio\(message\.audioUrl\)/);
  assert.match(source, /timeupdate/);
  assert.match(source, /audio\.currentTime/);
});
