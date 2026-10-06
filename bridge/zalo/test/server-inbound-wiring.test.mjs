import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('server forwards normalized incoming Zalo text and media to message gateway',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/createMessageGateway/);
  assert.match(source,/v21-zalo-bridge/);
  assert.match(source,/messageGateway\.ingestText\(event\)/);
  assert.match(source,/linkedZaloIds/);
  assert.match(source,/refreshLinkedZaloIds/);
  assert.match(source,/if\(!linkedZaloIds\.has\(String\(event\?\.zaloId\|\|''\)\)\)/);
  assert.match(source,/messageGateway\.mediaTarget\(event\)/);
  assert.match(source,/if\(!target\?\.needed\)/);
  assert.ok(
    source.indexOf('messageGateway.mediaTarget(event)') < source.indexOf('downloadInboundMedia({api,media:event.media[0]})'),
    'media target preflight must happen before Zalo binary download'
  );
  assert.match(source,/downloadInboundMedia/);
  assert.match(source,/messageGateway\.ingestMedia/);
});

test('server syncs the configured Zalo group and routes outbound by user/group thread type',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/ZALO_GROUP_FILTER/);
  assert.match(source,/syncApiGroups/);
  assert.match(source,/ThreadType\.Group/);
  assert.match(source,/ThreadType\.User/);
  assert.match(source,/messageGateway\.listOutbound/);
  assert.match(source,/buildOutboundMessage/);
  assert.match(source,/api\.sendMessage/);
  assert.match(source,/messageGateway\.markOutboundResult/);
  assert.match(source,/scheduleOutboundRetry/);
});

test('runtime coalesces an outbound signal that arrives during an active send',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/createCoalescingRunner/);
  assert.match(source,/const pollOutbound=createCoalescingRunner\(runOutboundPass\)/);
  assert.match(source,/outboundNow:pollOutbound/);
});


test('outbound bridge is event-driven with failure-only retry and no recurring message poll',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/ZALO_FALLBACK_POLL_MS/);
  assert.doesNotMatch(source,/outboundTimer=setInterval/);
  assert.match(source,/outboundNow:pollOutbound/);
  assert.match(source,/scheduleOutboundRetry/);
});


test('unlinked inbound traffic is dropped before any Supabase message or media call',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  const guard=source.indexOf("if(!linkedZaloIds.has(String(event?.zaloId||'')))");
  assert.ok(guard>=0,'missing linked-Zalo guard');
  assert.ok(guard<source.indexOf('messageGateway.mediaTarget(event)'));
  assert.ok(guard<source.indexOf('messageGateway.ingestText(event)'));
});
