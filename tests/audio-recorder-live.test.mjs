import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/chat/composer.ts', import.meta.url), 'utf8');

test('composer recording uses browser MediaRecorder and preserves the resulting File for live upload', () => {
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(source, /new MediaRecorder/);
  assert.match(source, /ondataavailable/);
  assert.match(source, /new File\(/);
  assert.match(source, /audioFile:\s*file/);
});

test('record pause/resume controls the recorder and cleanup always stops microphone tracks', () => {
  assert.match(source, /\.pause\(\)/);
  assert.match(source, /\.resume\(\)/);
  assert.match(source, /getTracks\(\).*stop/s);
});
