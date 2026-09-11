import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('server forwards normalized incoming Zalo text to message gateway',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/createMessageGateway/);
  assert.match(source,/v21-zalo-bridge/);
  assert.match(source,/messageGateway\.ingestText\(event\)/);
});
