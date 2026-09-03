import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseVoiceCallService } from '../.local-build/services/supabase/voice-call-service.js';

function activeCall(overrides = {}) {
  return {
    id: 'call-1',
    conversation_id: 'conv-1',
    caller_profile_id: 'me',
    callee_profile_id: 'peer',
    caller_device_id: 'dev-me',
    accepted_device_id: null,
    state: 'ringing',
    created_at: '2026-09-03T07:00:00Z',
    ringing_at: '2026-09-03T07:00:00Z',
    accepted_at: null,
    connecting_at: null,
    connected_at: null,
    updated_at: '2026-09-03T07:00:00Z',
    caller_display_name: 'Tùng',
    caller_avatar_url: null,
    callee_display_name: 'Khách A',
    callee_avatar_url: null,
    ...overrides
  };
}

function fixture(initialCalls = []) {
  const calls = [];
  let rows = initialCalls;
  let onVoiceChange = null;
  const port = {
    auth: {},
    async rpc(name, args = {}) {
      calls.push(['rpc', name, args]);
      if (name === 'chat_get_active_voice_calls') return { data: rows, error: null };
      if (name === 'chat_start_voice_call') return { data: { ok: true, call_id: 'call-1', state: 'ringing', callee_profile_id: 'peer' }, error: null };
      if (name === 'chat_accept_voice_call') return { data: { ok: true, call_id: 'call-1', state: 'accepted', accepted_device_id: 'dev-me' }, error: null };
      if (name === 'chat_decline_voice_call') return { data: { ok: true, state: 'declined' }, error: null };
      if (name === 'chat_cancel_voice_call') return { data: { ok: true, state: 'cancelled' }, error: null };
      if (name === 'chat_end_voice_call') return { data: { ok: true, state: 'ended' }, error: null };
      if (name === 'chat_mark_voice_call_connecting') return { data: { ok: true, state: 'connecting' }, error: null };
      if (name === 'chat_mark_voice_call_connected') return { data: { ok: true, state: 'connected' }, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
    functions: {
      async invoke(name, body) {
        calls.push(['function', name, body]);
        return { data: { serverUrl: 'wss://taphoa.livekit.cloud', participantToken: 'token-1' }, error: null };
      }
    },
    subscribeToVoiceCalls(handler) {
      calls.push(['subscribe']);
      onVoiceChange = handler;
      return () => calls.push(['unsubscribe']);
    }
  };
  let handlers = null;
  const audio = {
    joins: [],
    muted: [],
    starts: 0,
    disconnects: 0,
    async join(credentials, nextHandlers) { this.joins.push(credentials); handlers = nextHandlers; },
    async setMuted(value) { this.muted.push(value); },
    async startAudio() { this.starts += 1; },
    async disconnect() { this.disconnects += 1; }
  };
  return {
    port,
    audio,
    calls,
    setRows(next) { rows = next; },
    async signal() { onVoiceChange?.(); await new Promise((resolve) => setTimeout(resolve, 0)); },
    remoteAudio() { handlers?.onRemoteAudio(); },
    disconnected() { handlers?.onDisconnected(); }
  };
}

async function configured(f, localProfileId = 'me', deviceId = 'dev-me') {
  const service = new SupabaseVoiceCallService(f.port, f.audio);
  service.configure({ localProfileId, deviceId });
  const events = [];
  service.subscribe((event) => events.push(event));
  await service.start();
  return { service, events };
}

test('outgoing call starts Supabase ringing state, joins authorized LiveKit room, and stays connecting until remote audio', async () => {
  const f = fixture();
  const { service, events } = await configured(f);
  f.calls.length = 0;
  await service.startOutgoing({ conversationId: 'conv-1', peerId: 'peer', peerName: 'Khách A', peerInitials: 'KA' });
  assert.deepEqual(f.calls[0], ['rpc', 'chat_start_voice_call', { p_conversation_id: 'conv-1', p_device_id: 'dev-me' }]);
  assert.deepEqual(f.calls[1], ['function', 'taphoa-livekit-token', { callId: 'call-1', deviceId: 'dev-me' }]);
  assert.deepEqual(f.audio.joins, [{ serverUrl: 'wss://taphoa.livekit.cloud', participantToken: 'token-1' }]);
  assert.equal(events.at(-1).type, 'connecting');
  assert.equal(events.some((event) => event.type === 'connected'), false);
});

test('incoming ringing call is surfaced from realtime active-call refresh and accept joins only after accepted device is written', async () => {
  const incoming = activeCall({ caller_profile_id: 'peer', callee_profile_id: 'me', caller_device_id: 'dev-peer', caller_display_name: 'Khách A', callee_display_name: 'Tùng' });
  const f = fixture([incoming]);
  const { service, events } = await configured(f);
  assert.deepEqual(events[0], { type: 'incoming', peerId: 'peer', peerName: 'Khách A', peerInitials: 'KA' });
  f.calls.length = 0;
  await service.acceptIncoming();
  assert.deepEqual(f.calls[0], ['rpc', 'chat_accept_voice_call', { p_call_id: 'call-1', p_device_id: 'dev-me' }]);
  assert.deepEqual(f.calls[1], ['function', 'taphoa-livekit-token', { callId: 'call-1', deviceId: 'dev-me' }]);
  assert.deepEqual(f.calls[2], ['rpc', 'chat_mark_voice_call_connecting', { p_call_id: 'call-1' }]);
  assert.equal(events.at(-1).type, 'connecting');
});

test('remote audio marks canonical call connected and emits connected once', async () => {
  const f = fixture();
  const { service, events } = await configured(f);
  await service.startOutgoing({ conversationId: 'conv-1', peerId: 'peer', peerName: 'Khách A', peerInitials: 'KA' });
  f.calls.length = 0;
  f.remoteAudio();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(f.calls[0], ['rpc', 'chat_mark_voice_call_connected', { p_call_id: 'call-1' }]);
  assert.equal(events.filter((event) => event.type === 'connected').length, 1);
});

test('mute delegates to LiveKit microphone state without changing Supabase call state', async () => {
  const f = fixture();
  const { service } = await configured(f);
  await service.startOutgoing({ conversationId: 'conv-1', peerId: 'peer', peerName: 'Khách A', peerInitials: 'KA' });
  f.calls.length = 0;
  await service.setMuted(true);
  await service.setMuted(false);
  assert.deepEqual(f.audio.muted, [true, false]);
  assert.deepEqual(f.calls, []);
});

test('ringing caller cancels while ringing callee declines', async () => {
  const outgoingFixture = fixture();
  const { service: outgoing } = await configured(outgoingFixture);
  await outgoing.startOutgoing({ conversationId: 'conv-1', peerId: 'peer', peerName: 'Khách A', peerInitials: 'KA' });
  outgoingFixture.calls.length = 0;
  await outgoing.end();
  assert.deepEqual(outgoingFixture.calls[0], ['rpc', 'chat_cancel_voice_call', { p_call_id: 'call-1' }]);

  const incoming = activeCall({ caller_profile_id: 'peer', callee_profile_id: 'me', caller_device_id: 'dev-peer', caller_display_name: 'Khách A', callee_display_name: 'Tùng' });
  const incomingFixture = fixture([incoming]);
  const { service: callee } = await configured(incomingFixture);
  incomingFixture.calls.length = 0;
  await callee.end();
  assert.deepEqual(incomingFixture.calls[0], ['rpc', 'chat_decline_voice_call', { p_call_id: 'call-1', p_device_id: 'dev-me' }]);
});

test('accepted/connecting call ends through chat_end_voice_call and disconnects media', async () => {
  const incoming = activeCall({ caller_profile_id: 'peer', callee_profile_id: 'me', caller_device_id: 'dev-peer', accepted_device_id: 'dev-me', state: 'connecting', caller_display_name: 'Khách A', callee_display_name: 'Tùng' });
  const f = fixture([incoming]);
  const { service } = await configured(f);
  f.calls.length = 0;
  await service.end();
  assert.deepEqual(f.calls[0], ['rpc', 'chat_end_voice_call', { p_call_id: 'call-1', p_reason: 'ended' }]);
  assert.equal(f.audio.disconnects, 1);
});


test('restored active call emits peer context so CallController can hydrate after reload', async () => {
  const restored = activeCall({
    caller_profile_id: 'peer',
    callee_profile_id: 'me',
    caller_device_id: 'dev-peer',
    accepted_device_id: 'dev-me',
    state: 'connecting',
    caller_display_name: 'Khách A',
    callee_display_name: 'Tùng'
  });
  const f = fixture([restored]);
  const { events } = await configured(f);
  assert.deepEqual(events[0], {
    type: 'connecting',
    peerId: 'peer',
    peerName: 'Khách A',
    peerInitials: 'KA',
    direction: 'incoming'
  });
});
