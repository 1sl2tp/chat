import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveKitJsAudioTransport } from '../.local-build/services/livekit/livekit-js-audio.js';

function fixture() {
  const roomEvents = new Map();
  const attached = [];
  const room = {
    canPlaybackAudio: true,
    localParticipant: {
      calls: [],
      async setMicrophoneEnabled(enabled, options) { this.calls.push([enabled, options]); }
    },
    on(event, handler) { roomEvents.set(event, handler); return this; },
    async connect(url, token) { this.connected = [url, token]; },
    async startAudio() { this.audioStarts = (this.audioStarts ?? 0) + 1; },
    disconnect() { this.disconnects = (this.disconnects ?? 0) + 1; }
  };
  class Room { constructor(options) { room.options = options; return room; } }
  const sdk = {
    Room,
    RoomEvent: {
      TrackSubscribed: 'trackSubscribed',
      TrackUnsubscribed: 'trackUnsubscribed',
      Disconnected: 'disconnected',
      AudioPlaybackStatusChanged: 'audioPlaybackStatusChanged'
    },
    Track: { Kind: { Audio: 'audio', Video: 'video' } }
  };
  const host = { appendChild(node) { attached.push(node); } };
  return { sdk, room, roomEvents, attached, host };
}

test('LiveKit room is audio-only with WebRTC voice processing and publishes microphone after connect', async () => {
  const f = fixture();
  const transport = new LiveKitJsAudioTransport(f.sdk, f.host);
  await transport.join({ serverUrl: 'wss://lk', participantToken: 'token' }, { onRemoteAudio() {}, onDisconnected() {} });
  assert.deepEqual(f.room.connected, ['wss://lk', 'token']);
  assert.deepEqual(f.room.options.audioCaptureDefaults, {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1
  });
  assert.equal(f.room.options.disconnectOnPageLeave, true);
  assert.deepEqual(f.room.localParticipant.calls[0], [true, {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1
  }]);
  assert.equal(f.room.audioStarts ?? 0, 0);
});

test('subscribed remote audio attaches an audio element and notifies media-ready; video is ignored', async () => {
  const f = fixture();
  let ready = 0;
  const transport = new LiveKitJsAudioTransport(f.sdk, f.host);
  await transport.join({ serverUrl: 'wss://lk', participantToken: 'token' }, { onRemoteAudio() { ready += 1; }, onDisconnected() {} });
  const audioElement = { remove() { this.removed = true; } };
  const audioTrack = { kind: 'audio', attach() { return audioElement; }, detach() { return [audioElement]; } };
  f.roomEvents.get('trackSubscribed')(audioTrack, {}, {});
  assert.deepEqual(f.attached, [audioElement]);
  assert.equal(ready, 1);
  const videoTrack = { kind: 'video', attach() { throw new Error('video must not attach'); } };
  f.roomEvents.get('trackSubscribed')(videoTrack, {}, {});
  assert.equal(ready, 1);
});

test('mute and unmute use setMicrophoneEnabled while disconnect removes attached audio', async () => {
  const f = fixture();
  const transport = new LiveKitJsAudioTransport(f.sdk, f.host);
  await transport.join({ serverUrl: 'wss://lk', participantToken: 'token' }, { onRemoteAudio() {}, onDisconnected() {} });
  const audioElement = { remove() { this.removed = true; } };
  const track = { kind: 'audio', attach() { return audioElement; }, detach() { return [audioElement]; } };
  f.roomEvents.get('trackSubscribed')(track, {}, {});
  await transport.setMuted(true);
  await transport.setMuted(false);
  assert.equal(f.room.localParticipant.calls.at(-2)[0], false);
  assert.equal(f.room.localParticipant.calls.at(-1)[0], true);
  await transport.disconnect();
  assert.equal(audioElement.removed, true);
  assert.equal(f.room.disconnects, 1);
});


test('startAudio primes the Room inside the user gesture and join reuses that same Room', async () => {
  const f = fixture();
  const transport = new LiveKitJsAudioTransport(f.sdk, f.host);
  await transport.startAudio();
  assert.equal(f.room.audioStarts, 1);
  await transport.join({ serverUrl: 'wss://lk', participantToken: 'token' }, { onRemoteAudio() {}, onDisconnected() {} });
  assert.deepEqual(f.room.connected, ['wss://lk', 'token']);
  assert.equal(f.room.audioStarts, 1);
});
