import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIncomingMessage} from '../src/incoming-message.mjs';

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

test('turns missed Zalo voice call log into a normal text message',()=>{
  const event=normalizeIncomingMessage(callMessage({params:{duration:0,calltype:0,isCaller:false}}));
  assert.equal(event?.zaloId,'zalo-user-call');
  assert.equal(event?.messageId,'call-1');
  assert.equal(event?.text,'Zalo · Cuộc gọi thoại nhỡ');
  assert.equal(event?.media,undefined);
  assert.equal(event?.call,undefined);
});

test('turns ended Zalo video call log into a normal text message with duration',()=>{
  const event=normalizeIncomingMessage(callMessage({
    id:'call-2',
    action:'recommened.calltime',
    contentAsString:true,
    params:{duration:'32',calltype:1,isCaller:0},
  }));
  assert.equal(event?.text,'Zalo · Cuộc gọi video đã kết thúc · 00:32');
  assert.equal(event?.media,undefined);
  assert.equal(event?.call,undefined);
});

test('turns ended Zalo voice call log without duration into a short normal text message',()=>{
  const event=normalizeIncomingMessage(callMessage({
    id:'call-3',
    action:'recommened.calltime',
    params:{duration:0,calltype:0,isCaller:false},
  }));
  assert.equal(event?.text,'Zalo · Cuộc gọi thoại đã kết thúc');
});

test('ignores non-call chat.recommended messages',()=>{
  const event=normalizeIncomingMessage(callMessage({
    action:'recommened.link',
    params:{href:'https://example.test'},
  }));
  assert.equal(event,null);
});
