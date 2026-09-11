import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {normalizeIncomingMessage} from '../src/incoming-message.mjs';
import {createMessageGateway} from '../src/message-gateway.mjs';

function callMessage({id='call-1',action='recommened.misscall',params={},contentAsString=false}={}){
  const content={action,params:JSON.stringify(params)};
  return{
    type:0,
    isSelf:false,
    threadId:'zalo-user-call',
    data:{
      msgId:id,
      msgType:'chat.recommended',
      ts:'1789128000000',
      content:contentAsString?JSON.stringify(content):content,
    },
  };
}

test('normalizes inbound missed Zalo voice call log as notification event',()=>{
  const event=normalizeIncomingMessage(callMessage({params:{duration:0,calltype:0,isCaller:false}}));
  assert.equal(event?.zaloId,'zalo-user-call');
  assert.equal(event?.messageId,'call-1');
  assert.equal(event?.text,'');
  assert.deepEqual(event?.call,{
    result:'missed',
    kind:'voice',
    durationSeconds:0,
    isCaller:false,
  });
  assert.equal(event?.media,undefined);
});

test('normalizes ended Zalo video call log with duration from string content',()=>{
  const event=normalizeIncomingMessage(callMessage({
    id:'call-2',
    action:'recommened.calltime',
    contentAsString:true,
    params:{duration:'32',calltype:1,isCaller:0},
  }));
  assert.deepEqual(event?.call,{
    result:'ended',
    kind:'video',
    durationSeconds:32,
    isCaller:false,
  });
});

test('ignores non-call chat.recommended messages',()=>{
  const event=normalizeIncomingMessage(callMessage({
    action:'recommened.link',
    params:{href:'https://example.test'},
  }));
  assert.equal(event,null);
});

test('message gateway posts canonical Zalo call notification ingress',async()=>{
  let request=null;
  const fetchImpl=async(_url,init)=>{
    request=init;
    return{ok:true,status:200,async json(){return{ok:true,message_id:'chat-call-message-1'};}};
  };
  const gateway=createMessageGateway({
    endpoint:'https://example.test/functions/v1/v21-zalo-bridge',
    bridgeToken:'secret',
    fetchImpl,
  });
  const result=await gateway.ingestCall({
    zaloId:'zalo-user-call',messageId:'call-3',eventAt:'2026-09-11T12:00:00.000Z',
    call:{result:'missed',kind:'voice',durationSeconds:0,isCaller:false},
  });
  assert.deepEqual(result,{messageId:'chat-call-message-1'});
  assert.equal(request?.method,'POST');
  const body=JSON.parse(request?.body||'{}');
  assert.deepEqual(body,{
    action:'ingress_call',
    zalo_id:'zalo-user-call',
    zalo_message_id:'call-3',
    event_at:'2026-09-11T12:00:00.000Z',
    call_result:'missed',
    call_kind:'voice',
    duration_seconds:0,
    is_caller:false,
  });
});

test('server routes call notifications to ingestCall without invoking CHAT call engine',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/event\?\.call/);
  assert.match(source,/messageGateway\.ingestCall\(event\)/);
  assert.doesNotMatch(source,/V21CallEngine|LiveKit/);
});
