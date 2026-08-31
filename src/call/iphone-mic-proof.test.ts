import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const pageUrl = new URL('../../public/call-test/iphone/index.html', import.meta.url);

describe('iPhone standalone mic proof', () => {
  it('contains only capture → 5s record → stop mic → local playback', async () => {
    const html = await readFile(pageUrl, 'utf8');

    for (const snippet of [
      'navigator.mediaDevices.getUserMedia({ audio: true })',
      'new MediaRecorder(stream',
      'recorder.stop()',
      'track.stop()',
      'URL.createObjectURL(blob)',
      '<audio',
      'controls',
    ]) {
      expect(html).toContain(snippet);
    }

    for (const snippet of [
      'LiveKit',
      'RTCPeerConnection',
      'AudioContext',
      'navigator.audioSession',
      'supabase',
      'setSinkId',
    ]) {
      expect(html).not.toContain(snippet);
    }
  });
});
