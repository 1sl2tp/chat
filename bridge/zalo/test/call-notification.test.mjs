import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIncomingMessage} from '../src/incoming-message.mjs';

function callMessage({id='call-1',action='recommened.misscall',contentAsString=false}={}){
  const content={action,params:'{}'};
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

test('turns Zalo missed-call log into one plain text message',()=>{
  const event=normalizeIncomingMessage(callMessage());
  assert.equal(event?.zaloId,'zalo-user-call');
  assert.equal(event?.messageId,'call-1');
  assert.equal(event?.text,'Cuộc gọi nhỡ');
  assert.equal(event?.media,undefined);
  assert.equal(event?.call,undefined);
});

test('also accepts missed-call content when Zalo sends it as JSON string',()=>{
  const event=normalizeIncomingMessage(callMessage({id:'call-2',contentAsString:true}));
  assert.equal(event?.text,'Cuộc gọi nhỡ');
});

test('ignores ended-call summaries and other chat.recommended messages',()=>{
  assert.equal(normalizeIncomingMessage(callMessage({id:'call-3',action:'recommened.calltime'})),null);
  assert.equal(normalizeIncomingMessage(callMessage({id:'call-4',action:'recommened.link'})),null);
});
