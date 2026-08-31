import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const pageUrl = new URL('../public/call-test/iphone/index.html', import.meta.url);

describe('iPhone standalone mic proof', () => {
  it('contains only the approved capture-record-playback path', async () => {
    const html = await readFile(pageUrl, 'utf8');

    const required = [
      'navigator.mediaDevices.getUserMedia({ audio: true })',
      'new MediaRecorder(stream',
      'recorder.stop()',
      'track.stop()',
      'URL.createObjectURL(blob)',
      '<audio',
      'controls',
    ];

    for (const snippet of required) expect(html).toContain(snippet);

    const forbidden = [
      'LiveKit',
      'RTCPeerConnection',
      'AudioContext',
      'navigator.audioSession',
      'supabase',
      'setSinkId',
    ];

    for (const snippet of forbidden) expect(html).not.toContain(snippet);
  });
});
