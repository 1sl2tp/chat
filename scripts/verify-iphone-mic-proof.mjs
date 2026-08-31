import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/call-test/iphone/index.html', import.meta.url), 'utf8');

const requiredSnippets = [
  'navigator.mediaDevices.getUserMedia({ audio: true })',
  'new MediaRecorder(stream',
  'setTimeout',
  'recorder.stop()',
  'track.stop()',
  'URL.createObjectURL(blob)',
  '<audio',
  'controls',
];

for (const snippet of requiredSnippets) {
  if (!html.includes(snippet)) {
    throw new Error(`Missing iPhone mic proof contract: ${snippet}`);
  }
}

const forbiddenSnippets = [
  'LiveKit',
  'RTCPeerConnection',
  'AudioContext',
  'navigator.audioSession',
  'supabase',
  'setSinkId',
];

for (const snippet of forbiddenSnippets) {
  if (html.includes(snippet)) {
    throw new Error(`Forbidden dependency in iPhone mic proof: ${snippet}`);
  }
}

console.log('iphone mic proof contract PASS');
