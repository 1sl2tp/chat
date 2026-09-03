import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('main selects live Supabase only from bundled public config and keeps mock fallback', () => {
  const main = read('src/main.ts');
  const config = read('src/services/supabase/config.ts');
  assert.match(main, /readBundledSupabaseConfig/);
  assert.match(main, /createLiveSupabaseServices/);
  assert.match(main, /startMockRuntime/);
  assert.match(config, /__TAPHOA_SUPABASE_URL__/);
  assert.match(config, /__TAPHOA_SUPABASE_PUBLISHABLE_KEY__/);
  assert.doesNotMatch(main + config, /service[_-]?role/i);
});

test('live bootstrap shows auth gate only when no restorable session exists', () => {
  const main = read('src/main.ts');
  assert.match(main, /liveBootstrap\.restore/);
  assert.match(main, /showAuthGate/);
  assert.match(main, /activateLiveSession/);
});

test('main creates conversation sources from runtime peer bindings for mobile and desktop admin', () => {
  const main = read('src/main.ts');
  const workspace = read('src/admin/admin-workspace.ts');
  assert.match(main, /conversationSourceFor\(peer\)/);
  assert.match(main, /conversationSource:\s*conversationSourceFor\(peer\)/);
  assert.match(workspace, /conversationSourceFor\?:/);
  assert.match(workspace, /conversationSource:\s*this\.callbacks\.conversationSourceFor\?\.\(contact\)/);
});

test('live service factory wires the same authenticated Supabase port to LiveKit voice calls', () => {
  const source = read('src/runtime/live-services.ts');
  assert.match(source, /import\('@?livekit-client'\)/);
  assert.match(source, /LiveKitJsAudioTransport/);
  assert.match(source, /SupabaseVoiceCallService/);
  assert.match(source, /call:/);
});

test('main binds live call service with profile plus device id and preserves mock fallback', () => {
  const main = read('src/main.ts');
  assert.match(main, /liveCallService/);
  assert.match(main, /deviceId:\s*session\.deviceId/);
  assert.match(main, /calls\.bindService/);
  assert.match(main, /calls\.bindService\(null\)/);
});
