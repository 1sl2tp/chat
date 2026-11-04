'use strict';
// SPEC-DEBT-CHAT-ZALO-ACK-20261104 — exercise real bridge logic with memory-only fakes.
// No network API, Supabase calls, customer messages, or production data writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'bridge/zalo/src/server.mjs'), 'utf8');
const splitSql = fs.readFileSync(path.join(root, 'supabase/migrations/20261005111750_split_zalo_text_media_delivery.sql'), 'utf8');
const terminalSql = fs.readFileSync(path.join(root, 'supabase/migrations/20261005113816_terminalize_stale_zalo_outbound.sql'), 'utf8');
const start = server.indexOf('async function sendOutboundRow(row){');
const end = server.indexOf('\nconst pollOutbound=', start);
assert.ok(start >= 0 && end > start, 'canonical outbound sender and ACK pass must be found');
const implementation = server.slice(start, end);

function fixture(rows, {failMedia = false} = {}) {
  const sent = [], results = [], warnings = [];
  const api = {
    async sendMessage(body, recipientId, threadType) {
      sent.push({body, recipientId, threadType});
      if (failMedia && body.kind === 'image') throw Error('simulated image transport failure');
      return {message:{msgId:'zalo-ack-' + sent.length}};
    },
    async sendVoice() {throw Error('unexpected audio API');},
  };
  const ctx = {
    api,
    messageGateway: {
      async listOutbound(limit) {assert.equal(limit, 20); return rows;},
      async markOutboundResult(value) {results.push(value);},
    },
    ThreadType: {User:'user', Group:'group'},
    buildOutboundMessage: async row => ({kind:row.media.length ? 'image' : 'text', payload:row.text || row.media}),
    bridgeStats: {outboundSent:0},
    console: {warn:(...args)=>warnings.push(args)},
  };
  vm.runInNewContext(implementation + '\nglobalThis.__outbound = runOutboundPass;', ctx, {timeout: 1000});
  return {run:ctx.__outbound, sent, results, warnings, stats:ctx.bridgeStats};
}

const textRow = {deliveryId:'fake-text',zaloId:'fake-zalo-recipient',threadType:'user',text:'Debt summary link',media:[]};
const pngRow = {deliveryId:'fake-png',zaloId:'fake-zalo-recipient',threadType:'user',text:'',media:[{kind:'image',signedUrl:'https://invalid.example/local-only.png'}]};

test('Chat text and PNG are two independent Zalo deliveries with separate ACKs', async () => {
  const f = fixture([textRow, pngRow]);
  assert.equal(await f.run(), 2);
  assert.equal(f.sent.length, 2);
  assert.equal(f.stats.outboundSent, 2);
  assert.deepEqual(f.results.map(x=>x.deliveryId), ['fake-text','fake-png']);
  assert.deepEqual(f.results.map(x=>x.ok), [true,true]);
  assert.ok(f.results[0].zaloMessageId);
  assert.ok(f.results[1].zaloMessageId);
  assert.notEqual(f.results[0].zaloMessageId, f.results[1].zaloMessageId);
});

test('a successfully sent text cannot mask a failed image delivery', async () => {
  const f = fixture([textRow, pngRow], {failMedia:true});
  assert.equal(await f.run(), 2);
  assert.deepEqual(f.results.map(x=>x.ok), [true,false]);
  assert.equal(f.results[0].deliveryId, 'fake-text');
  assert.equal(f.results[1].deliveryId, 'fake-png');
  assert.match(f.results[1].error, /simulated image transport failure/);
  assert.equal(f.stats.outboundSent, 1);
});

test('Chat media enqueuing requires an actual media asset, not just a message ID', () => {
  assert.match(splitSql, /check \(delivery_part in \('message','text','media'\)\)/);
  assert.match(splitSql, /on public\.zalo_message_links\(chat_message_id,delivery_part\)/);
  assert.match(splitSql, /on conflict\(chat_message_id,delivery_part\)/);
  assert.match(terminalSql, /d\.delivery_part='media' and exists\(/);
  assert.match(terminalSql, /from public\.v21_media_assets a/);
  assert.match(terminalSql, /a\.kind in \('image','audio','file'\)/);
  assert.match(terminalSql, /grant execute on function public\.v21_zalo_outbound_due_media\(integer\) to service_role/);
});
