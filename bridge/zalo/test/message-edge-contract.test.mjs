import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edgePath=new URL('../../../supabase/functions/v21-zalo-bridge/index.ts',import.meta.url);

test('message edge authenticates bridge token and routes message bridge actions',()=>{
  assert.equal(fs.existsSync(edgePath),true,'missing v21-zalo-bridge edge function');
  const source=fs.readFileSync(edgePath,'utf8');
  for(const token of [
    'x-bridge-token',
    'v21_zalo_ingress',
    'v21_zalo_outbound_due',
    'v21_zalo_outbound_result',
  ]) assert.ok(source.includes(token),token);
});

test('server forwards inbound and polls outbound through message gateway',()=>{
  const server=fs.readFileSync(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.ok(server.includes('createMessageGateway'));
  assert.ok(server.includes('messageGateway.ingestText(event)'));
  assert.ok(server.includes('messageGateway.listOutbound'));
  assert.ok(server.includes('messageGateway.markOutboundResult'));
});
