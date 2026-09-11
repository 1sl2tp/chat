import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIncomingMessage,bindIncomingMessageListener} from '../src/incoming-message.mjs';

const USER=0;
const GROUP=1;

test('normalizes new direct-user text from zca listener',()=>{
  const event=normalizeIncomingMessage({
    type:USER,
    isSelf:false,
    threadId:'zalo-user-1',
    data:{msgId:'msg-1',cliMsgId:'cli-1',ts:'1789105000000',content:' xin chào '}
  });
  assert.deepEqual(event,{
    zaloId:'zalo-user-1',
    messageId:'msg-1',
    text:'xin chào',
    eventAt:'2026-09-11T05:36:40.000Z'
  });
});

test('ignores self, group and non-text messages',()=>{
  assert.equal(normalizeIncomingMessage({type:USER,isSelf:true,threadId:'z1',data:{msgId:'m1',ts:'1',content:'x'}}),null);
  assert.equal(normalizeIncomingMessage({type:GROUP,isSelf:false,threadId:'g1',data:{msgId:'m2',ts:'1',content:'x'}}),null);
  assert.equal(normalizeIncomingMessage({type:USER,isSelf:false,threadId:'z1',data:{msgId:'m3',ts:'1',content:{type:'photo'}}}),null);
});

test('binds message listener and forwards only normalized events',async()=>{
  let messageHandler=null;
  const api={listener:{on(name,handler){assert.equal(name,'message');messageHandler=handler;}}};
  const seen=[];
  const unbind=bindIncomingMessageListener({api,onMessage:event=>{seen.push(event);}});
  assert.equal(typeof messageHandler,'function');
  await messageHandler({type:USER,isSelf:false,threadId:'z2',data:{msgId:'m9',ts:'1789105000000',content:'hello'}});
  assert.equal(seen.length,1);
  assert.equal(seen[0].zaloId,'z2');
  assert.equal(typeof unbind,'function');
});
