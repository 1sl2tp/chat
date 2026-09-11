import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('server forwards normalized incoming Zalo text and media to message gateway',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/createMessageGateway/);
  assert.match(source,/v21-zalo-bridge/);
  assert.match(source,/messageGateway\.ingestText\(event\)/);
  assert.match(source,/downloadInboundMedia/);
  assert.match(source,/messageGateway\.ingestMedia/);
});

test('server polls pending Chat text or media and sends it to direct-user Zalo',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/ThreadType/);
  assert.match(source,/messageGateway\.listOutbound/);
  assert.match(source,/buildOutboundMessage/);
  assert.match(source,/api\.sendMessage/);
  assert.match(source,/ThreadType\.User/);
  assert.match(source,/messageGateway\.markOutboundResult/);
  assert.match(source,/setInterval/);
});

test('runtime coalesces an outbound signal that arrives during an active send',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/createCoalescingRunner/);
  assert.match(source,/const pollOutbound=createCoalescingRunner\(runOutboundPass\)/);
  assert.match(source,/outboundNow:pollOutbound/);
});
