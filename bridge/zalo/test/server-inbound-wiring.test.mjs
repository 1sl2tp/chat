import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('server forwards normalized incoming Zalo text to message gateway',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/createMessageGateway/);
  assert.match(source,/v21-zalo-bridge/);
  assert.match(source,/messageGateway\.ingestText\(event\)/);
});

test('server polls pending Chat text and sends it to direct-user Zalo',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/ThreadType/);
  assert.match(source,/messageGateway\.listOutbound/);
  assert.match(source,/api\.sendMessage/);
  assert.match(source,/ThreadType\.User/);
  assert.match(source,/messageGateway\.markOutboundResult/);
  assert.match(source,/setInterval/);
});
